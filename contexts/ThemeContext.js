// ============================================================
// FILE: contexts/ThemeContext.js
// Spatial Drop — light/dark theme toggle.
//
// light/dark mode, the simplest real version of it. both palettes are
// built off the exact same cherry accent (was amber), so flipping the
// switch doesn't make the app feel like a different product, just a
// different lighting. anything reading COLORS directly today still
// works fine — this just gives you a second palette to swap to, and a
// context so any screen can read or flip it.
// ============================================================

import React, { createContext, useContext, useState } from 'react';

export const darkTheme = {
  name: 'dark',
  // MATCHED — was '#110b0a' (a slightly warm off-black), now the exact
  // literal '#000000' the radar screen has always used (see App.js's
  // radar-stage background, which intentionally never read this token).
  // every other screen reads this value, so this one change is what
  // actually makes them match instead of being two very-close-but-not-
  // quite darks sitting next to each other.
  bg: '#000000',
  card: '#1C1A18',
  text: '#F2EDE6',
  mutedText: '#8A8580',
  // MATCHED — was '#8C1A3F', now the same '#C8123F' as constants/colors.js,
  // which is the literal color the idle peer markers render on radar.
  amber: '#C8123F', // deep cherry/burgundy — key name kept as "amber" so nothing else has to change
  boxBorder: '#2A2724',
  boxBorderFilled: '#5A544C',
  error: '#4AC2C2', // cyan — pin errors, ghost drop text. was red, changed because it read too close to the cherry accent.
  danger: '#D95B5B', // NEW — split off from `error`. this is specifically for destructive actions (log out), which should stay red/warning-colored, NOT the same cyan as informational error text — those are two different meanings that briefly got merged into one color.
  incomingGlow: '#D9708F', // brightened on purpose — the accent itself is dark now, incoming needs to stay visually distinct from it
  idkman: '#C8123F',
  starGold: '#D9A05B', // secondary accent, radar-screen background dots only
};

// same accent as dark mode, just darkened slightly here so it still
// has enough contrast sitting on a light background — not a different
// identity, just the same one read in daylight instead of at night
export const lightTheme = {
  name: 'light',
  bg: '#F5F2EF',
  card: '#FFFFFF',
  text: '#1A1817',
  mutedText: '#8C8680',
  amber: '#A31E47',
  boxBorder: '#DEDAD5',
  boxBorderFilled: '#C4BFB8',
  error: '#238585', // cyan, deepened for contrast on the light background — same split as dark mode above
  danger: '#C23B3B', // NEW — split off from `error`, same reasoning as dark mode: log out stays red, error text stays cyan
  incomingGlow: '#B8496A', // deepened to match, same logic as the accent's light-mode version
  idkman: '#A31E47',
  starGold: '#B8763A', // deepened to match, same logic as everything else in this palette
};

const ThemeContext = createContext({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true); // dark stays the default, matches everything already built

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ theme: isDark ? darkTheme : lightTheme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// swap this in for COLORS once a screen actually needs to respond to
// the toggle: const { theme } = useTheme();
export function useTheme() {
  return useContext(ThemeContext);
}