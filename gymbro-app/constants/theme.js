// constants/theme.js — brand tokens from Phase 3 §2.0.
// "Gym poster" energy: heavy weights, tight tracking, letter-spaced micro-labels.
//
// Tokens are named by ROLE, not by appearance. `surface.inverse` is "the
// surface that contrasts with the page", which is near-black in light mode and
// a raised dark grey in dark mode — whereas the old `ink.black` named a colour
// and became a lie the moment a dark palette existed.
//
// Nothing here should be imported for its colour value directly. Components
// read the active palette through useTheme()/useThemedStyles so a theme change
// re-renders them; a module-scope `StyleSheet.create` captures values once at
// import and can never update.

// Scale, spacing and type are theme-independent — only colour has two sets.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

// Headings shout (900 + negative tracking); eyebrows whisper (700, uppercase,
// wide tracking, small). This pairing repeats on every screen.
export const typography = {
  hero: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  h2: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  stat: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  body: { fontSize: 14, fontWeight: '500' },
  small: { fontSize: 12, fontWeight: '500' },
};

/**
 * Light palette.
 *
 * surface.inverse / inverseDeep were `ink.black` (#111111) and `ink.deep`
 * (#0A0A0A) — pure blacks used as tab bar, headers, dark cards and Workout
 * Mode's ground. They read as hard cutouts against the white page and had
 * nowhere to go once a dark theme existed (F11). They are now soft charcoals:
 * still clearly "the dark surface", but sitting in the same neutral family as
 * the light greys instead of punching a hole in them.
 */
export const lightColors = {
  // redText is the same as red here: #EF0000 already clears 4.5:1 on white,
  // so light mode needs no separate accent-text value.
  brand: { red: '#EF0000', redText: '#EF0000', redDim: '#C50000', redTint: '#FFF5F5' },
  surface: {
    primary: '#FFFFFF',
    secondary: '#F8F8F8',
    tertiary: '#FAFAFA',
    inverse: '#1F2125',
    inverseDeep: '#17181B',
  },
  border: { default: '#E0E0E0', soft: '#F0F0F0', inverse: '#33363C' },
  text: {
    primary: '#111111',
    muted: '#888888',
    faint: '#AAAAAA',
    mid: '#555555',
    inverse: '#FFFFFF',
    inverseMuted: '#9A9A9A',
  },
  success: '#22C55E',
  // Scrims and hairlines that sit on top of surface.inverse. Kept as tokens so
  // the 58 hardcoded rgba() literals that used to be scattered through the
  // components have one home and can differ per theme.
  onInverse: {
    hairline: 'rgba(255,255,255,0.12)',
    divider: 'rgba(255,255,255,0.08)',
    raisedSoft: 'rgba(255,255,255,0.05)',
    raised: 'rgba(255,255,255,0.07)',
    raisedStrong: 'rgba(255,255,255,0.15)',
    brandWash: 'rgba(239,0,0,0.12)',
    outline: 'rgba(255,255,255,0.2)',
    placeholder: 'rgba(255,255,255,0.3)',
    subtle: 'rgba(255,255,255,0.6)',
  },
  backdrop: 'rgba(0,0,0,0.6)',
  // The two non-brand macro bars on the nutrition ring panel. Protein uses the
  // brand red; these two need hues of their own to stay distinguishable.
  macro: { carbs: '#F5A524', fat: '#3B82F6' },
  // The launch screen deliberately does NOT follow the theme: it carries its
  // own background in both palettes by design, so the main logo needs no light
  // variant. Identical in lightColors and darkColors on purpose — these are the
  // two values to change when the new launch-screen design lands.
  splash: { background: '#FFFFFF', text: '#555555' },
};

/**
 * Dark palette.
 *
 * Deliberately subdued. The base is a neutral near-black (#121316) rather than
 * true black, so raised surfaces have somewhere to go and OLED smearing is
 * avoided. Text is near-white rather than #FFFFFF — at full white on a dark
 * ground the glare and halation make long text harder to read, and #F5F6F8 is
 * indistinguishable from white in use.
 *
 * The brand red is desaturated from #EF0000 to #E5484D: full-saturation red on
 * a dark ground blooms and vibrates. #E5484D holds the brand hue, clears 4.5:1
 * against the base, and stays calm next to white text.
 */
export const darkColors = {
  // Two reds, because one value cannot serve both jobs on a dark ground.
  //
  //   red     — fills: buttons, pills, the FAB, selected states. Deep enough
  //             to look considered rather than lit, and to carry a near-white
  //             label at 4.65:1.
  //   redText — red *text* and small glyphs sitting ON a dark surface, where
  //             the fill red would fall to 3.7:1. Clears 4.5:1 against the
  //             page, cards and chrome alike. It is the lightest value that
  //             does so — anything lighter drifts pink and starts to glow.
  brand: { red: '#D12F38', redText: '#E9575C', redDim: '#A8252D', redTint: '#241619' },
  surface: {
    primary: '#121316',
    secondary: '#191B1F',
    tertiary: '#1E2024',
    // In dark mode the "contrasting" surface cannot be darker than the page,
    // so it becomes a raised one. Same role, inverted mechanism.
    inverse: '#1E2025',
    inverseDeep: '#191A1E',
  },
  border: { default: '#2A2D33', soft: '#212429', inverse: '#33363C' },
  text: {
    primary: '#F5F6F8',
    muted: '#9BA1A6',
    faint: '#6F757B',
    mid: '#C3C7CC',
    inverse: '#F5F6F8',
    inverseMuted: '#9BA1A6',
  },
  // Calmer than the #3DD68C first pass, which read as mint neon against the
  // near-black. Still clears 4.5:1 for the 8px status text in the chat
  // header, and being darker also improves the near-white label on the
  // success toast fill.
  success: '#3BAC79',
  onInverse: {
    hairline: 'rgba(255,255,255,0.10)',
    divider: 'rgba(255,255,255,0.07)',
    raisedSoft: 'rgba(255,255,255,0.04)',
    raised: 'rgba(255,255,255,0.06)',
    raisedStrong: 'rgba(255,255,255,0.12)',
    brandWash: 'rgba(229,72,77,0.14)',
    outline: 'rgba(255,255,255,0.18)',
    placeholder: 'rgba(255,255,255,0.28)',
    subtle: 'rgba(255,255,255,0.55)',
  },
  backdrop: 'rgba(0,0,0,0.72)',
  // A touch less saturated than light mode so they sit with the calmer red.
  macro: { carbs: '#E8A23A', fat: '#5B93F0' },
  // Matches lightColors on purpose — see the note there.
  splash: { background: '#FFFFFF', text: '#555555' },
};

export const palettes = { light: lightColors, dark: darkColors };

/** Options for the Appearance control. 'system' follows the OS setting. */
export const THEME_MODES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// There is deliberately no `colors` export. A frozen palette imported at module
// scope is how the pre-refactor code baked light-mode values into every
// StyleSheet at import time. Without it, reaching for a colour outside
// useTheme()/useThemedStyles is a lint error rather than a silent bug that only
// shows up in dark mode.

export default { lightColors, darkColors, palettes, spacing, radius, typography };
