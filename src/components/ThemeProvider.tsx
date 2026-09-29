import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { loadTheme, saveTheme, ThemeContext } from '../lib/theme'
import type { Theme } from '../lib/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadTheme)

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia(DARK_QUERY).matches)
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
    }
    apply()
    if (theme !== 'system') return

    // Follow the OS while on "system", e.g. when it switches at sunset.
    const media = matchMedia(DARK_QUERY)
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (next: Theme) => {
    saveTheme(next)
    setThemeState(next)
  }

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>
}
