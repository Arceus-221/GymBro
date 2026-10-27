jest.mock('axios');
const axios = require('axios');
const { call } = require('../services/aiProviders/geminiAdapter');

beforeEach(() => axios.post.mockReset());

it('reports a truncated response before attempting to parse it', async () => {
  axios.post.mockResolvedValue({ data: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"weeklySchedule":[' }] } }] } });
  await expect(call('system', 'user', 8192)).rejects.toMatchObject({ code: 'AI_OUTPUT_TRUNCATED' });
});

it('reports missing text as a malformed provider response', async () => {
  axios.post.mockResolvedValue({ data: { candidates: [{ finishReason: 'STOP' }] } });
  await expect(call('system', 'user', 8192)).rejects.toMatchObject({ code: 'AI_SCHEMA_VIOLATION' });
});

it('parses complete JSON responses', async () => {
  axios.post.mockResolvedValue({ data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] } });
  await expect(call('system', 'user', 8192)).resolves.toEqual({ ok: true });
});
