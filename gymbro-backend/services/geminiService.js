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
  PLAN_ADJUSTMENT: 8192,
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
