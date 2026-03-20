// src/store/profile.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ProfileData {
  nome:      string
  cognome:   string
  email:     string
  telefono:  string
  cellulare: string
}

interface ProfileState {
  profile:       ProfileData
  updateProfile: (data: Partial<ProfileData>) => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: { nome: '', cognome: '', email: '', telefono: '', cellulare: '' },
      updateProfile: (data) =>
        set((s) => ({ profile: { ...s.profile, ...data } })),
    }),
    { name: 'wi-profile' }
  )
)
