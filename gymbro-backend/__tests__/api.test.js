// The Admin SDK initializes at import time against a real service account,
// which CI does not have and should not have. Mocking the module keeps these
// tests to the routing and auth-gate behaviour they actually cover — none of
// the paths asserted below reach Firebase, because verifyToken rejects a
// missing or malformed header before it ever calls mockVerifyIdToken.
const mockVerifyIdToken = jest.fn();

jest.mock('../config/firebase', () => {
  // Both AI controllers call admin.firestore() at module scope, so the mock has
  // to satisfy that at import time even though no test here performs a write.
  const firestore = () => ({
    collection: jest.fn(),
    doc: jest.fn(),
    batch: jest.fn(),
  });
  firestore.FieldValue = {
    serverTimestamp: jest.fn(),
    increment: jest.fn(),
  };

  return {
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
    firestore,
  };
});

const request = require('supertest');
const app = require('../index');

// A token the mocked verifier accepts. Tests that need to get past the auth
// gate to reach body validation use this; nothing here reaches Gemini.
//
// Each call mints a fresh uid: perUserThrottle keeps an in-memory
// last-request map per user with a 2s floor, so two validation tests sharing
// one uid would see the second answered 429 before the body is ever read.
let seq = 0;
const asSignedIn = () =>
  mockVerifyIdToken.mockResolvedValueOnce({ uid: `test-uid-${++seq}`, email: 't@example.com' });

afterEach(() => mockVerifyIdToken.mockReset());

describe('GET /health', () => {
  it('answers 200 without authentication', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('falls through to the 404 handler rather than the error handler', async () => {
    const res = await request(app).get('/api/ai/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Route not found' });
  });
});

describe('auth gate', () => {
  it('rejects a request carrying no Authorization header', async () => {
    const res = await request(app).post('/api/ai/chat').send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });

  it('rejects an Authorization header that is not a Bearer token', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', 'Token abc123')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });
});

describe('meal endpoints', () => {
  it.each(['/api/ai/meal-detail', '/api/ai/substitute-meal'])(
    '%s sits behind the auth gate',
    async (path) => {
      const res = await request(app).post(path).send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('MISSING_TOKEN');
    }
  );

  const meal = {
    mealType: 'lunch',
    description: 'Grilled chicken with rice (200g cooked rice)',
    calories: 620,
    proteinG: 45,
    carbsG: 70,
    fatsG: 14,
  };

  it('meal-detail rejects a currency that is not a 3-letter ISO code', async () => {
    asSignedIn();
    const res = await request(app)
      .post('/api/ai/meal-detail')
      .set('Authorization', 'Bearer valid')
      .send({ meal, currency: 'taka' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
    expect(res.body.message).toMatch(/currency/);
  });

  it('meal-detail rejects a meal with an unknown mealType', async () => {
    asSignedIn();
    const res = await request(app)
      .post('/api/ai/meal-detail')
      .set('Authorization', 'Bearer valid')
      .send({ meal: { ...meal, mealType: 'brunch' }, currency: 'BDT' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
  });

  it('substitute-meal rejects a missing meal', async () => {
    asSignedIn();
    const res = await request(app)
      .post('/api/ai/substitute-meal')
      .set('Authorization', 'Bearer valid')
      .send({ reason: 'no eggs' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST_BODY');
  });
});
