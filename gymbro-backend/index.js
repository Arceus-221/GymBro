// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { traceRequest } = require('./services/requestTrace');

const aiRoutes = require('./routes/ai');
const audioRoutes = require('./routes/audio');

const app = express();

// Middleware
app.use(traceRequest);
app.use(cors({
  origin: '*', // Tighten this in production to your app's domain if using a web build
  exposedHeaders: ['X-Request-ID'],
}));
app.use('/api/ai/adjust-plan', express.json({ limit: '64kb' }));
app.use(express.json({ limit: '10kb' })); // Limit body size to prevent abuse

// Health check (unauthenticated — used by Render, the keep-warm GitHub Action,
// and the client's wakeBackend() ping — see Phase 5 §1)
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/audio', audioRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

// Only bind a port when this file is run directly. Requiring it from a test
// must not start a server, or Jest hangs on the open handle after the suite
// finishes.
if (require.main === module) {
  app.listen(PORT, () => console.log(`GymBro API running on port ${PORT}`));
}

module.exports = app; // exported for supertest in __tests__
