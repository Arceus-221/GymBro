// OpenAI-compatible /chat/completions shape — the drop-in fallback provider
// if Gemini's free tier ever becomes a hard blocker (Phase 5 §3.2).
const axios = require('axios');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const parseJsonDefensively = (rawText) => {
  try {
    return JSON.parse(rawText);
  } catch {
    const cleaned = rawText.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }
};

const call = async (systemPrompt, userPrompt, maxTokens) => {
  const payload = {
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  };

  const response = await axios.post(OPENROUTER_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    timeout: 30000,
  });

  const rawText = response.data.choices[0].message.content;
  return parseJsonDefensively(rawText);
};

module.exports = { call };
