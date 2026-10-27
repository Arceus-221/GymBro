// Provider-resolving facade. Filename kept as "geminiService" for import-path
// stability (every controller does `require('./geminiService')`) even though
// it no longer hardcodes Gemini — see Phase 5 §3.2 for the rename rationale.
//
// TOKEN_LIMITS: per-feature output ceilings. Always pass one of these to
// callGemini()'s third argument — never a raw number. Undershooting
// PLAN_RESTRUCTURE or MEAL_PLANNER will silently truncate JSON mid-structure.
const TOKEN_LIMITS = {
  CHAT: 1200,
  SUBSTITUTE: 1000,
  RECOVERY: 1000,
  PLAN_RESTRUCTURE: 2500,
  MEAL_PLANNER: 4500,
  MEAL_DETAIL: 1500,     // one recipe: ~8 ingredients + ~8 steps + a tip
  SUBSTITUTE_MEAL: 1200, // 3 alternatives, one sentence each
};

const PROVIDERS = {
  gemini: require('./aiProviders/geminiAdapter'),
  openrouter: require('./aiProviders/openRouterAdapter'),
};

const resolveProvider = () => {
  const providerKey = process.env.AI_PROVIDER || 'gemini';
  const provider = PROVIDERS[providerKey];

  if (!provider) {
    throw new Error(
      `AI_PROVIDER="${providerKey}" is not a recognized adapter. Valid options: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  return provider;
};

const callGemini = async (systemPrompt, userPrompt, maxTokens = TOKEN_LIMITS.CHAT) => {
  const provider = resolveProvider();
  return provider.call(systemPrompt, userPrompt, maxTokens);
};

module.exports = { callGemini, TOKEN_LIMITS };
// Non-functional placeholder 0949.
// Non-functional placeholder 0950.
// Non-functional placeholder 0951.
// Non-functional placeholder 0952.
// Non-functional placeholder 0953.
// Non-functional placeholder 0954.
// Non-functional placeholder 0955.
// Non-functional placeholder 0956.
// Non-functional placeholder 0957.
// Non-functional placeholder 0958.
// Non-functional placeholder 0959.
// Non-functional placeholder 0960.
// Non-functional placeholder 0961.
// Non-functional placeholder 0962.
// Non-functional placeholder 0963.
// Non-functional placeholder 0964.
// Non-functional placeholder 0965.
// Non-functional placeholder 0966.
// Non-functional placeholder 0967.
// Non-functional placeholder 0968.
// Non-functional placeholder 0969.
// Non-functional placeholder 0970.
// Non-functional placeholder 0971.
// Non-functional placeholder 0972.
// Non-functional placeholder 0973.
// Non-functional placeholder 0974.
// Non-functional placeholder 0975.
// Non-functional placeholder 0976.
// Non-functional placeholder 0977.
// Non-functional placeholder 0978.
// Non-functional placeholder 0979.
// Non-functional placeholder 0980.
// Non-functional placeholder 0981.
// Non-functional placeholder 0982.
// Non-functional placeholder 0983.
// Non-functional placeholder 0984.
// Non-functional placeholder 0985.
// Non-functional placeholder 0986.
// Non-functional placeholder 0987.
// Non-functional placeholder 0988.
// Non-functional placeholder 0989.
// Non-functional placeholder 0990.
// Non-functional placeholder 0991.
// Non-functional placeholder 0992.
// Non-functional placeholder 0993.
// Non-functional placeholder 0994.
// Non-functional placeholder 0995.
// Non-functional placeholder 0996.
// Non-functional placeholder 0997.
// Non-functional placeholder 0998.
// Non-functional placeholder 0999.
// Non-functional placeholder 1000.
