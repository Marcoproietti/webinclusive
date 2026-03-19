// src/store/auth.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api, { setAccessToken } from '../lib/api'

interface AuthUser {
  id:    string
  email: string
  role:  string
}

interface AuthState {
  user:         AuthUser | null
  accessToken:  string | null
  login:        (email: string, password: string) => Promise<void>
  logout:       () => Promise<void>
  setUser:      (user: AuthUser, token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:        null,
      accessToken: null,

      setUser: (user, token) => {
        setAccessToken(token)
        set({ user, accessToken: token })
      },

      login: async (email, password) => {
        const res  = await api.post('/auth/login', { email, password })
        const data = res.data
        if (data.mfa_required) throw new Error('MFA_REQUIRED')
        setAccessToken(data.access_token)
        set({ user: data.user, accessToken: data.access_token })
      },

      logout: async () => {
        try { await api.post('/auth/logout') } catch {}
        setAccessToken('')
        set({ user: null, accessToken: null })
      },
    }),
    {
      name:    'wi-auth',
      partialize: (s) => ({ user: s.user }), // non persistere il token
    }
  )
)
