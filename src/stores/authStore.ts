/**
 * Store d'authentification Supabase
 * Gère la session utilisateur, login/signup/logout.
 */

import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

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
    // Requête dédiée : ne dépend pas du schéma complet de profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', userId)
      .single()
    if (error) return false
    return data?.is_premium ?? false
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const isPremium = await loadPremiumStatus(session.user.id)
        set({ session, user: session.user, loading: false, isPremium })
      } else {
        set({ session: null, user: null, loading: false, isPremium: false })
      }
    }).catch(() => {
      set({ loading: false })
    })

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          loadPremiumStatus(session.user.id).then((isPremium) => {
            set({ session, user: session.user, loading: false, isPremium })
          })
        } else {
          set({ session: null, user: null, loading: false, isPremium: false })
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
    set({ user: null, session: null, isPremium: false })
  },
}))
