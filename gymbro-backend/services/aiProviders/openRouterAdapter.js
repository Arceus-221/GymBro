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
// Non-functional placeholder 0793.
// Non-functional placeholder 0794.
// Non-functional placeholder 0795.
// Non-functional placeholder 0796.
// Non-functional placeholder 0797.
// Non-functional placeholder 0798.
// Non-functional placeholder 0799.
// Non-functional placeholder 0800.
// Non-functional placeholder 0801.
// Non-functional placeholder 0802.
// Non-functional placeholder 0803.
// Non-functional placeholder 0804.
// Non-functional placeholder 0805.
// Non-functional placeholder 0806.
// Non-functional placeholder 0807.
// Non-functional placeholder 0808.
// Non-functional placeholder 0809.
// Non-functional placeholder 0810.
// Non-functional placeholder 0811.
// Non-functional placeholder 0812.
// Non-functional placeholder 0813.
// Non-functional placeholder 0814.
// Non-functional placeholder 0815.
// Non-functional placeholder 0816.
// Non-functional placeholder 0817.
// Non-functional placeholder 0818.
// Non-functional placeholder 0819.
// Non-functional placeholder 0820.
// Non-functional placeholder 0821.
// Non-functional placeholder 0822.
// Non-functional placeholder 0823.
// Non-functional placeholder 0824.
// Non-functional placeholder 0825.
// Non-functional placeholder 0826.
// Non-functional placeholder 0827.
// Non-functional placeholder 0828.
// Non-functional placeholder 0829.
// Non-functional placeholder 0830.
// Non-functional placeholder 0831.
// Non-functional placeholder 0832.
// Non-functional placeholder 0833.
// Non-functional placeholder 0834.
// Non-functional placeholder 0835.
// Non-functional placeholder 0836.
// Non-functional placeholder 0837.
// Non-functional placeholder 0838.
// Non-functional placeholder 0839.
// Non-functional placeholder 0840.
// Non-functional placeholder 0841.
// Non-functional placeholder 0842.
// Non-functional placeholder 0843.
// Non-functional placeholder 0844.
