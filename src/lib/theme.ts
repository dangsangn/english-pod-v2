// Light, dark, or whatever the OS says. The choice is kept in localStorage;
// ThemeProvider applies it as a class on <html> (Tailwind's `selector` mode).

import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export const THEMES: Theme[] = ['light', 'system', 'dark']

const STORAGE_KEY = 'theme'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(saved as Theme) ? (saved as Theme) : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}
