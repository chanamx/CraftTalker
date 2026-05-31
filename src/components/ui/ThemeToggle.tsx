import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { gentleSpring } from '@/lib/motion'

function getTheme(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem('luker-theme')
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeToggle() {
  const [dark, setDark] = useState(getTheme)

  const toggleTheme = useCallback(() => {
    setDark(prev => {
      const next = !prev
      localStorage.setItem('luker-theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [dark])

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.9 }}
      onClick={toggleTheme}
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      className="p-1.5 rounded-lg hover:bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150 relative"
    >
      <motion.div
        key={dark ? 'moon' : 'sun'}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
        transition={gentleSpring}
      >
        {dark ? <Moon size={18} /> : <Sun size={18} />}
      </motion.div>
    </motion.button>
  )
}
