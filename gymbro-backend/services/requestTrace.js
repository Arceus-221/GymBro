const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');

const requests = new AsyncLocalStorage();

// Only operation metadata is logged: never tokens, prompts, profiles, or replies.
const traceStage = (stage, details = {}) => {
  const trace = requests.getStore();
  if (!trace) return;
  trace.stage = stage;
  console.info('[api]', JSON.stringify({
    requestId: trace.id,
    route: trace.route,
    stage,
    elapsedMs: Date.now() - trace.startedAt,
    ...details,
  }));
};

const traceRequest = (req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const trace = {
    id: randomUUID(),
    route: `${req.method} ${req.path}`,
    startedAt: Date.now(),
    stage: 'received',
  };
  res.setHeader('X-Request-ID', trace.id);
  requests.run(trace, () => {
    traceStage('received');
    res.once('finish', () => requests.run(trace, () => {
      traceStage('response', { status: res.statusCode, lastStage: trace.stage });
    }));
    res.once('close', () => {
      if (!res.writableFinished) requests.run(trace, () => {
        traceStage('connection-closed', { lastStage: trace.stage });
      });
    });
    next();
  });
};

module.exports = { traceRequest, traceStage };
