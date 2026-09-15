const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { saveBase64Image } = require('../utils/imageUtils');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const search = req.query.search || '';
    const items = db.getAllLogistics(search);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/transactions', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const transactions = db.getLogisticsTransactions(limit);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, (req, res) => {
  const { name, price, quantity, image_base64 } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required.' });
  }

  try {
    let image_path = '';
    if (image_base64) {
      image_path = saveBase64Image(image_base64);
    }

    const item = db.addLogisticsItem({
      name,
      price: parseFloat(price),
      quantity: parseInt(quantity) || 0,
      image_path
    });

    if (item.quantity > 0) {
      db.recordLogisticsTransaction(item.id, 'restock', item.quantity, item.price, 'Initial stock setup');
    }

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { name, price, quantity, image_base64 } = req.body;

  try {
    let image_path = existing.image_path;
    if (image_base64) {
      if (existing.image_path && existing.image_path.startsWith('/uploads/')) {
        const oldFilepath = path.join(__dirname, '..', '..', 'frontend', existing.image_path);
        if (fs.existsSync(oldFilepath)) {
          try { fs.unlinkSync(oldFilepath); } catch (e) {}
        }
      }
      image_path = saveBase64Image(image_base64);
    }

    const updatedQty = quantity !== undefined ? parseInt(quantity) : existing.quantity;
    const prevQty = existing.quantity;

    const item = db.updateLogisticsItem(id, {
      name: name || existing.name,
      price: price !== undefined ? parseFloat(price) : existing.price,
      quantity: updatedQty,
      image_path
    });

    if (updatedQty !== prevQty) {
      const diff = updatedQty - prevQty;
      const type = diff > 0 ? 'restock' : 'sale';
      db.recordLogisticsTransaction(id, type, Math.abs(diff), item.price, 'Stock adjusted via edit');
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  try {
    if (existing.image_path && existing.image_path.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, '..', '..', 'frontend', existing.image_path);
      if (fs.existsSync(filepath)) {
        try { fs.unlinkSync(filepath); } catch (e) {}
      }
    }

    db.deleteLogisticsItem(id);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/sell', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { quantity, notes } = req.body;
  const qtyToSell = parseInt(quantity);

  if (isNaN(qtyToSell) || qtyToSell <= 0) {
    return res.status(400).json({ error: 'Valid quantity is required.' });
  }

  if (qtyToSell > existing.quantity) {
    return res.status(400).json({ error: `Not enough stock. Available: ${existing.quantity}` });
  }

  try {
    const updatedQty = existing.quantity - qtyToSell;
    db.updateLogisticsItem(id, {
      name: existing.name,
      price: existing.price,
      quantity: updatedQty,
      image_path: existing.image_path
    });

    db.recordLogisticsTransaction(id, 'sale', qtyToSell, existing.price, notes || 'Product sold');
    res.json({ success: true, message: `${qtyToSell} units sold.`, available: updatedQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restock', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { quantity, notes } = req.body;
  const qtyToAdd = parseInt(quantity);

  if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
    return res.status(400).json({ error: 'Valid quantity is required.' });
  }

  try {
    const updatedQty = existing.quantity + qtyToAdd;
    db.updateLogisticsItem(id, {
      name: existing.name,
      price: existing.price,
      quantity: updatedQty,
      image_path: existing.image_path
    });

    db.recordLogisticsTransaction(id, 'restock', qtyToAdd, existing.price, notes || 'Stock replenishment');
    res.json({ success: true, message: `${qtyToAdd} units added.`, available: updatedQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
