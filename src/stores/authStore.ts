/**
 * Store d'authentification Supabase
 * Gère la session utilisateur, login/signup/logout.
 */

import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getUserProfile } from '@/services/supabase.service'

type AuthState = {
  user: User | null
  session: Session | null
  loading: boolean
  isPremium: boolean

  initialize: () => () => void
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

async function loadPremiumStatus(userId: string): Promise<boolean> {
  try {
    const profile = await getUserProfile(userId)
    return profile?.is_premium ?? false
  } catch {
    return false
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  session: null,
  loading: true,
  isPremium: false,

  initialize: () => {
    // Récupérer la session existante
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false })
      if (session?.user) {
        loadPremiumStatus(session.user.id).then((isPremium) => set({ isPremium }))
      }
    })

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        set({ session, user: session?.user ?? null, loading: false })
        if (session?.user) {
          loadPremiumStatus(session.user.id).then((isPremium) => set({ isPremium }))
        } else {
          set({ isPremium: false })
        }
      },
    )

    return () => subscription.unsubscribe()
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
