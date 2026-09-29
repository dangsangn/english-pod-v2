import { Laptop, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import classNames from 'classnames'
import { THEMES, useTheme } from '../lib/theme'
import type { Theme } from '../lib/theme'

const ICONS: Record<Theme, LucideIcon> = { light: Sun, system: Laptop, dark: Moon }

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role='group'
      aria-label='Theme'
      className='flex items-center gap-1 p-1 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700'
    >
      {THEMES.map((t) => {
        const Icon = ICONS[t]
        return (
          <button
            key={t}
            type='button'
            onClick={() => setTheme(t)}
            aria-pressed={theme === t}
            aria-label={`Switch to ${t} theme`}
            title={`Switch to ${t} theme`}
            className={classNames(
              'p-1.5 rounded-full transition-all duration-200',
              theme === t
                ? 'bg-white dark:bg-zinc-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200',
            )}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}
