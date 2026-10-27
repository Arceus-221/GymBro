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
// Non-functional placeholder 0897.
// Non-functional placeholder 0898.
// Non-functional placeholder 0899.
// Non-functional placeholder 0900.
// Non-functional placeholder 0901.
// Non-functional placeholder 0902.
// Non-functional placeholder 0903.
// Non-functional placeholder 0904.
// Non-functional placeholder 0905.
// Non-functional placeholder 0906.
// Non-functional placeholder 0907.
// Non-functional placeholder 0908.
// Non-functional placeholder 0909.
// Non-functional placeholder 0910.
// Non-functional placeholder 0911.
// Non-functional placeholder 0912.
// Non-functional placeholder 0913.
// Non-functional placeholder 0914.
// Non-functional placeholder 0915.
// Non-functional placeholder 0916.
// Non-functional placeholder 0917.
// Non-functional placeholder 0918.
// Non-functional placeholder 0919.
// Non-functional placeholder 0920.
// Non-functional placeholder 0921.
// Non-functional placeholder 0922.
// Non-functional placeholder 0923.
// Non-functional placeholder 0924.
// Non-functional placeholder 0925.
// Non-functional placeholder 0926.
// Non-functional placeholder 0927.
// Non-functional placeholder 0928.
// Non-functional placeholder 0929.
// Non-functional placeholder 0930.
// Non-functional placeholder 0931.
// Non-functional placeholder 0932.
// Non-functional placeholder 0933.
// Non-functional placeholder 0934.
// Non-functional placeholder 0935.
// Non-functional placeholder 0936.
// Non-functional placeholder 0937.
// Non-functional placeholder 0938.
// Non-functional placeholder 0939.
// Non-functional placeholder 0940.
// Non-functional placeholder 0941.
// Non-functional placeholder 0942.
// Non-functional placeholder 0943.
// Non-functional placeholder 0944.
// Non-functional placeholder 0945.
// Non-functional placeholder 0946.
// Non-functional placeholder 0947.
// Non-functional placeholder 0948.
