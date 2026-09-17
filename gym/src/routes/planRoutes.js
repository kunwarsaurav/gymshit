const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  try {
    res.json(db.getAllPlans());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, (req, res) => {
  const { plan_name, description, duration_value, duration_type, regular_price } = req.body;
  if (!plan_name || !duration_value || isNaN(regular_price)) {
    return res.status(400).json({ error: 'Plan name, duration, and price are required.' });
  }
  try {
    const plan = db.addPlan({
      plan_name: plan_name.trim(),
      description: description || '',
      duration_value: parseInt(duration_value),
      duration_type: duration_type || 'MONTH',
      regular_price: parseFloat(regular_price)
    });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const { plan_name, description, duration_value, duration_type, regular_price } = req.body;
  if (!plan_name || !duration_value || isNaN(regular_price)) {
    return res.status(400).json({ error: 'Plan name, duration, and price are required.' });
  }
  try {
    const updated = db.updatePlan(parseInt(req.params.id), {
      plan_name: plan_name.trim(),
      description: description || '',
      duration_value: parseInt(duration_value),
      duration_type: duration_type || 'MONTH',
      regular_price: parseFloat(regular_price)
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    db.deletePlan(parseInt(req.params.id));
    res.json({ success: true, message: 'Plan deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admission / Registration Fee settings
router.get('/admission-fee', requireAuth, (req, res) => {
  try {
    const fee = parseFloat(db.getSetting('admission_fee', '500')) || 0;
    res.json({ admission_fee: fee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admission-fee', requireAuth, (req, res) => {
  try {
    const fee = parseFloat(req.body.admission_fee);
    if (isNaN(fee) || fee < 0) {
      return res.status(400).json({ error: 'Valid admission fee amount is required.' });
    }
    db.setSetting('admission_fee', String(fee));
    res.json({ success: true, admission_fee: fee, message: 'Admission fee updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Backward compatible package endpoints
router.get('/packages', requireAuth, (req, res) => {
  try {
    const plans = db.getAllPlans();
    const pkgs = plans.map(p => ({
      id: p.id,
      name: p.plan_name,
      duration_months: p.duration_value,
      price: p.regular_price
    }));
    res.json(pkgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/packages', requireAuth, (req, res) => {
  const { name, duration_months, price } = req.body;
  try {
    const plan = db.addPlan({
      plan_name: name.trim(),
      description: 'Migrated package',
      duration_value: parseInt(duration_months),
      duration_type: 'MONTH',
      regular_price: parseFloat(price)
    });
    res.status(201).json({
      id: plan.id,
      name: plan.plan_name,
      duration_months: plan.duration_value,
      price: plan.regular_price
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/packages/:id', requireAuth, (req, res) => {
  try {
    db.deletePlan(parseInt(req.params.id));
    res.json({ success: true, message: 'Package deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
