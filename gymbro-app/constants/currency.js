// constants/currency.js — the currency recipe prices are estimated in.
//
// Derived from the device locale rather than asked for, because for almost
// everyone the answer is "the one my phone already knows". It travels to the
// backend per request (like availableEquipment does for exercise
// substitution) — it is a display preference, not profile data, so it is
// deliberately not stored in users/{uid}.

import { getLocales } from 'expo-localization';

const FALLBACK = 'USD';

/** ISO 4217 code for the device's primary locale, or USD if it has none. */
export function deviceCurrency() {
  const code = getLocales()?.[0]?.currencyCode;
  return typeof code === 'string' && /^[A-Z]{3}$/.test(code) ? code : FALLBACK;
}

/**
 * "৳120" / "$4.50" — localised where Intl can, a plain "120 BDT" where it
 * cannot. Estimates are rounded to whole units above 10 because false
 * precision on a guess reads as a quote.
 */
export function formatMoney(amount, currency) {
  if (amount == null || Number.isNaN(amount)) return '—';
  const digits = amount >= 10 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${currency}`;
  }
}
