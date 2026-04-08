/**
 * Formulaire de connexion Garmin Connect (login/password + MFA optionnel)
 * Les identifiants sont envoyés à l'instance Vercel personnelle ; seuls les
 * tokens OAuth résultants sont stockés côté client et en DB.
 */

import { useState } from 'react'
import { useGarminStore } from '@/stores/garminStore'
import { useAuthStore } from '@/stores/authStore'
import { garminLogin } from '@/services/garmin.service'
import { saveGarminConnection } from '@/services/supabase.service'

export function GarminLoginForm({ onConnected }: { onConnected: () => void }) {
  const { setTokens } = useGarminStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaState, setMfaState] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Email et mot de passe requis')
      return
    }
    if (mfaRequired && !mfaCode.trim()) {
      setError('Code MFA requis')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await garminLogin(
        username.trim(),
        password,
        mfaRequired ? mfaCode.trim() : undefined,
        mfaRequired ? mfaState : undefined,
      )

      if ('mfa_required' in result) {
        setMfaRequired(true)
        setMfaState(result.state)  // ← sauvegarder les cookies/csrf pour l'étape 2
        setLoading(false)
        return
      }

      setTokens(result.oauth1, result.oauth2, result.profile)
      // Sauvegarder la connexion en DB pour tout utilisateur authentifié
      const { user } = useAuthStore.getState()
      if (user) {
        saveGarminConnection(user.id, {
          oauth1: result.oauth1,
          oauth2: result.oauth2,
          profile: result.profile,
        }).catch(() => {})
      }
      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Avertissement sécurité */}
      <div className="bg-slate-800/60 border border-white/8 rounded-xl p-3 text-xs text-slate-500 flex items-start gap-2">
        <span className="shrink-0 text-slate-400">🔒</span>
        <span>
          Vos identifiants sont envoyes a votre instance Vercel personnelle uniquement. Les tokens OAuth sont stockes de maniere securisee sur votre compte.
        </span>
      </div>

      {!mfaRequired ? (
        /* ── Étape 1 : email + mot de passe ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Email Garmin Connect
            </label>
            <input
              type="email"
              placeholder="votre@email.com"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && void handleLogin()}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm
                         focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40
                         hover:border-white/20 transition-colors placeholder:text-slate-600"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null) }}
                onKeyDown={e => e.key === 'Enter' && void handleLogin()}
                className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-10 text-white text-sm
                           focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40
                           hover:border-white/20 transition-colors placeholder:text-slate-600 w-full"
              />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs">
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Étape 2 : code MFA reçu par email ── */
        <div className="space-y-3">
          <div className="bg-sky-950/40 border border-sky-800/50 rounded-xl p-3 text-sm text-sky-300 flex items-start gap-2">
            <span className="shrink-0 text-lg">📧</span>
            <div>
              <div className="font-semibold mb-0.5">Entrez le code déjà reçu par email</div>
              <div className="text-sky-500 text-xs">
                Garmin vous a envoyé un code à <strong className="text-sky-400">{username}</strong> lors de la première tentative.
                Saisissez <strong className="text-sky-300">ce même code</strong> — n'en attendez pas un nouveau.
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Code de vérification
            </label>
            <input
              type="text"
              placeholder="123456"
              value={mfaCode}
              onChange={e => { setMfaCode(e.target.value.replace(/\D/g, '')); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && void handleLogin()}
              maxLength={8}
              autoFocus
              className="bg-black/30 border border-sky-800/50 rounded-lg px-3 py-2 text-white text-sm
                         focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40
                         transition-colors placeholder:text-slate-600 tracking-widest text-center text-lg
                         w-40"
            />
          </div>
          <button
            onClick={() => { setMfaRequired(false); setMfaCode(''); setMfaState(null); setError(null) }}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            ← Recommencer avec d'autres identifiants
          </button>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs flex items-center gap-1.5">
          <span>⚠️</span>{error}
        </p>
      )}

      <button
        onClick={() => void handleLogin()}
        disabled={loading}
        className="w-full sm:w-auto px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50
                   text-white text-sm font-semibold rounded-xl transition-all flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {mfaRequired ? 'Vérification…' : 'Connexion à Garmin…'}
          </>
        ) : mfaRequired ? (
          '✅ Valider le code'
        ) : (
          '🏔️ Se connecter à Garmin Connect'
        )}
      </button>
    </div>
  )
}
