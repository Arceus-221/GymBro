// Global, process-wide limiter guarding every outbound Gemini call.
// Tuned against gemini-2.5-flash-lite's free-tier RPM ceiling (15 RPM).
// RPD (1,000/day) and shared TPM (250K) are separate ceilings this limiter
// does not address — see Phase 2 §7.4a/§7.4b and Phase 5 §2.
const Bottleneck = require('bottleneck');

const geminiLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 4200,       // ~14.3 req/min, under the 15 RPM hard cap as a safety margin
  highWater: 30,        // max queued jobs before rejecting new ones
  strategy: Bottleneck.strategy.OVERFLOW,
});

geminiLimiter.on('queued', () => {
  const queued = geminiLimiter.jobs('QUEUED').length;
  if (queued > 5) {
    console.warn(`[geminiRateLimiter] queue depth: ${queued} — Gemini 15 RPM ceiling under pressure`);
  }
});

geminiLimiter.on('dropped', (dropped) => {
  console.error('[geminiRateLimiter] job dropped — queue was full (highWater exceeded)', dropped);
});

module.exports = { geminiLimiter };
