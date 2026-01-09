import { useTheme } from '@/contexts/useTheme'

export function ThemeToggle() {
  const { theme, mode, toggleTheme } = useTheme()

  const label =
    mode === 'auto'
      ? `Auto (${theme === 'dark' ? 'Dark' : 'Light'})`
      : theme === 'dark'
        ? 'Dark'
        : 'Light'

  return (
    <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
      {label}
    </button>
  )
}
