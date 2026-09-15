const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  const mistralApiKey = process.env.MISTRAL_API_KEY ? process.env.MISTRAL_API_KEY.trim() : '';
  if (!mistralApiKey) {
    return res.status(400).json({ 
      error: 'Mistral API Key is not configured in .env. Please configure MISTRAL_API_KEY in the server environment.' 
    });
  }

  const agentId = process.env.MISTRAL_AGENT_ID ? process.env.MISTRAL_AGENT_ID.trim() : 'ag_019f9fef1481776097ed81bacbbca7fd';
  const url = 'https://api.mistral.ai/v1/agents/completions';

  try {
    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        agent_id: agentId,
        messages: messages
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('[Chat API Error]:', errorText);
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      const errMsg = errorJson?.message || errorJson?.detail || errorText || 'Failed to retrieve response from Mistral AI agent.';
      return res.status(apiResponse.status).json({ error: `Mistral API: ${errMsg}` });
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (err) {
    console.error('[Chat API Error]:', err);
    res.status(500).json({ error: err.message || 'Internal server error during chat.' });
  }
});

module.exports = router;
