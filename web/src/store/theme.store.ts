// src/store/theme.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FontOption = 'dm-sans' | 'system' | 'inter' | 'serif' | 'mono'
export type ColorTheme = 'navy' | 'slate' | 'forest' | 'viola' | 'burgundy' | 'grafite'

export const FONT_LABELS: Record<FontOption, string> = {
  'dm-sans': 'DM Sans',
  'system':  'System UI',
  'inter':   'Inter',
  'serif':   'Serif',
  'mono':    'Monospace',
}

const FONTS: Record<FontOption, string> = {
  'dm-sans': "'DM Sans', system-ui, sans-serif",
  'system':  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  'inter':   "'Inter', system-ui, sans-serif",
  'serif':   "'DM Serif Display', Georgia, serif",
  'mono':    "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
}

interface ThemeVars {
  navy:      string
  navy700:   string
  navy600:   string
  navy100:   string
  navy50:    string
  teal:      string
  tealLight: string
  mainBg:    string
}

export const COLOR_THEMES: Record<ColorTheme, { label: string; vars: ThemeVars }> = {
  navy: {
    label: 'Navy (default)',
    vars: {
      navy: '#0F2240', navy700: '#1A3A6B', navy600: '#1E4A8A',
      navy100: '#E8EFF8', navy50: '#F2F6FB',
      teal: '#0D7A5F', tealLight: '#E6F5F1', mainBg: '#F9FAFB',
    },
  },
  slate: {
    label: 'Slate',
    vars: {
      navy: '#1E293B', navy700: '#334155', navy600: '#475569',
      navy100: '#E2E8F0', navy50: '#F1F5F9',
      teal: '#0EA5E9', tealLight: '#E0F2FE', mainBg: '#F8FAFC',
    },
  },
  forest: {
    label: 'Forest',
    vars: {
      navy: '#14532D', navy700: '#166534', navy600: '#15803D',
      navy100: '#DCFCE7', navy50: '#F0FDF4',
      teal: '#16A34A', tealLight: '#DCFCE7', mainBg: '#F9FAFB',
    },
  },
  viola: {
    label: 'Viola',
    vars: {
      navy: '#3B1066', navy700: '#581C87', navy600: '#7E22CE',
      navy100: '#F3E8FF', navy50: '#FAF5FF',
      teal: '#9333EA', tealLight: '#F3E8FF', mainBg: '#FAFAFA',
    },
  },
  burgundy: {
    label: 'Burgundy',
    vars: {
      navy: '#4A0E2A', navy700: '#6D1040', navy600: '#9F1239',
      navy100: '#FFE4E6', navy50: '#FFF1F2',
      teal: '#E11D48', tealLight: '#FFE4E6', mainBg: '#FFF9FA',
    },
  },
  grafite: {
    label: 'Grafite',
    vars: {
      navy: '#18181B', navy700: '#27272A', navy600: '#3F3F46',
      navy100: '#F4F4F5', navy50: '#FAFAFA',
      teal: '#D97706', tealLight: '#FEF3C7', mainBg: '#F9FAFB',
    },
  },
}

interface ThemeState {
  font:         FontOption
  colorTheme:   ColorTheme
  setFont:      (font: FontOption) => void
  setColorTheme:(theme: ColorTheme) => void
  applyTheme:   () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      font:       'dm-sans',
      colorTheme: 'navy',

      setFont: (font) => {
        set({ font })
        setTimeout(() => get().applyTheme(), 0)
      },

      setColorTheme: (colorTheme) => {
        set({ colorTheme })
        setTimeout(() => get().applyTheme(), 0)
      },

      applyTheme: () => {
        const { font, colorTheme } = get()
        const r = document.documentElement.style
        r.setProperty('--font-body', FONTS[font])
        document.body.style.fontFamily = FONTS[font]
        const c = COLOR_THEMES[colorTheme].vars
        r.setProperty('--navy',       c.navy)
        r.setProperty('--navy-700',   c.navy700)
        r.setProperty('--navy-600',   c.navy600)
        r.setProperty('--navy-100',   c.navy100)
        r.setProperty('--navy-50',    c.navy50)
        r.setProperty('--teal',       c.teal)
        r.setProperty('--teal-light', c.tealLight)
        r.setProperty('--gray-50',    c.mainBg)
      },
    }),
    { name: 'wi-theme' }
  )
)
