//
// Model history, because this has now moved twice:
//   - gemini-2.0-flash / 2.0-flash-lite: fully shut down by Google June 1, 2026.
//   - gemini-2.5-flash-lite (what Phases 1-5 of the SRS specify) and
//     gemini-2.5-flash: both now return 404 "no longer available to new users",
//     verified against this project's own API key. The SRS's model choice is
//     dead for any project not already grandfathered in.
//   - gemini-3.5-flash-lite: current, verified working with the
//     responseMimeType:'application/json' config every controller depends on,
//     and still flash-LITE class so TOKEN_LIMITS and the 15 RPM limiter tuning
//     in Phase 5 remain appropriate.
//
// MODEL_ID stays isolated here (Phase 1 §3E's explicit intent) so the next
// forced migration is a one-line change rather than a project-wide edit.
const axios = require('axios');

const MODEL_ID = 'gemini-3.5-flash-lite';

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

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
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  };

  const response = await axios.post(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const rawText = response.data.candidates[0].content.parts[0].text;
  return parseJsonDefensively(rawText);
};

// MODEL_ID is exported so controllers can stamp `generatedByModel` on the
// documents they write instead of hardcoding a model string that silently
// goes stale the next time this constant changes.
module.exports = { call, MODEL_ID };
// Non-functional placeholder 0741.
// Non-functional placeholder 0742.
// Non-functional placeholder 0743.
// Non-functional placeholder 0744.
// Non-functional placeholder 0745.
// Non-functional placeholder 0746.
// Non-functional placeholder 0747.
// Non-functional placeholder 0748.
// Non-functional placeholder 0749.
// Non-functional placeholder 0750.
// Non-functional placeholder 0751.
// Non-functional placeholder 0752.
// Non-functional placeholder 0753.
// Non-functional placeholder 0754.
// Non-functional placeholder 0755.
// Non-functional placeholder 0756.
// Non-functional placeholder 0757.
// Non-functional placeholder 0758.
// Non-functional placeholder 0759.
// Non-functional placeholder 0760.
// Non-functional placeholder 0761.
// Non-functional placeholder 0762.
// Non-functional placeholder 0763.
// Non-functional placeholder 0764.
// Non-functional placeholder 0765.
// Non-functional placeholder 0766.
// Non-functional placeholder 0767.
// Non-functional placeholder 0768.
// Non-functional placeholder 0769.
// Non-functional placeholder 0770.
// Non-functional placeholder 0771.
// Non-functional placeholder 0772.
// Non-functional placeholder 0773.
// Non-functional placeholder 0774.
// Non-functional placeholder 0775.
// Non-functional placeholder 0776.
// Non-functional placeholder 0777.
// Non-functional placeholder 0778.
// Non-functional placeholder 0779.
// Non-functional placeholder 0780.
// Non-functional placeholder 0781.
// Non-functional placeholder 0782.
// Non-functional placeholder 0783.
// Non-functional placeholder 0784.
// Non-functional placeholder 0785.
// Non-functional placeholder 0786.
// Non-functional placeholder 0787.
// Non-functional placeholder 0788.
// Non-functional placeholder 0789.
// Non-functional placeholder 0790.
// Non-functional placeholder 0791.
// Non-functional placeholder 0792.
