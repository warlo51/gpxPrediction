/**
 * Composant connexion Garmin Connect
 * Login/password → tokens stockés dans le store (jamais le mot de passe)
 * Import automatique des activités avec fichiers FIT
 */

import { useState, useCallback } from 'react'
import { useGarminStore } from '@/stores/garminStore'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import { garminLogin, syncGarminProfile, buildProfileFromGarminStats } from '@/services/garmin.service'
import { saveRunnerProfile, saveGarminConnection } from '@/services/supabase.service'
import { formatRaceTime } from '@/services/racePredictor.service'

// ─── Formulaire de connexion ──────────────────────────────────────────────────

function GarminLoginForm({ onConnected }: { onConnected: () => void }) {
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

// ─── Panel de synchronisation Garmin ─────────────────────────────────────────

function GarminSyncPanel() {
  const { oauth1, oauth2, profile, disconnect } = useGarminStore()
  const { profile: runnerProfile, setProfile, garminRacePredictions, setGarminRacePredictions } = useAppStore()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<Date | null>(
    garminRacePredictions?.updatedAt ? new Date(garminRacePredictions.updatedAt) : null
  )

  const handleSync = useCallback(async () => {
    if (!oauth1 || !oauth2) return
    setSyncing(true)
    setError(null)

    try {
      console.log('[GarminSync] Starting sync…')
      const syncResult = await syncGarminProfile(oauth1, oauth2)

      // Construire le profil depuis les stats Garmin directes
      const updatedProfile = buildProfileFromGarminStats(syncResult, runnerProfile)
      setProfile(updatedProfile)
      setGarminRacePredictions(syncResult.racePredictions)
      setSyncedAt(new Date())

      console.log('[GarminSync] Profile updated:', {
        vo2Max: updatedProfile.vo2Max,
        flatSpeed: updatedProfile.speedModel.flatSpeed,
        racePredictions: syncResult.racePredictions.source,
      })

      // Sauvegarder en DB
      const { user } = useAuthStore.getState()
      if (user) {
        saveRunnerProfile(user.id, updatedProfile).catch(err => {
          console.error('[GarminSync] Error saving profile to DB:', err)
        })
      }
    } catch (err) {
      console.error('[GarminSync] Sync failed:', err)
      setError(err instanceof Error ? err.message : 'Erreur de synchronisation')
    } finally {
      setSyncing(false)
    }
  }, [oauth1, oauth2, runnerProfile, setProfile, setGarminRacePredictions])

  const predictions = garminRacePredictions

  return (
    <div className="space-y-4">
      {/* Profil connecté */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/20 border border-white/4 rounded-xl p-3">
        <div className="flex items-center gap-3">
          {profile?.profileImageUrl ? (
            <img src={profile.profileImageUrl} alt={profile.displayName}
              className="w-9 h-9 rounded-full border-2 border-sky-500 shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-sky-900/50 border-2 border-sky-700 flex items-center justify-center text-lg shrink-0">
              🏔️
            </div>
          )}
          <div>
            <div className="text-white font-semibold text-sm">{profile?.displayName ?? 'Garmin Connect'}</div>
            <div className="text-slate-500 text-xs">
              {syncedAt
                ? `Synchro : ${syncedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                : 'Pas encore synchronisé'}
            </div>
          </div>
          <span className="text-xs px-2 py-0.5 bg-sky-900/40 text-sky-400 rounded-full border border-sky-800/40">
            Connecté
          </span>
        </div>
        <button type="button" onClick={disconnect} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
          Déconnecter
        </button>
      </div>

      {/* Stats physiologiques (après sync) */}
      {runnerProfile.vo2Max && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            {
              icon: '📈',
              label: 'VO2max',
              value: `${runnerProfile.vo2Max.toFixed(1)} ml/kg/min`,
            },
            {
              icon: '🎯',
              label: 'Seuil lactate',
              value: runnerProfile.heartRateModel.lactateThresholdHR
                ? `${runnerProfile.heartRateModel.lactateThresholdHR} bpm`
                : '—',
            },
            {
              icon: '❤️',
              label: 'FC repos',
              value: `${runnerProfile.heartRateModel.restingHR} bpm`,
            },
            {
              icon: '⚡',
              label: 'Allure 10K',
              value: runnerProfile.basePaceSecPerKm > 0
                ? `${Math.floor(runnerProfile.basePaceSecPerKm / 60)}:${String(runnerProfile.basePaceSecPerKm % 60).padStart(2, '0')}/km`
                : '—',
            },
          ].map(item => (
            <div key={item.label} className="bg-sky-950/20 border border-sky-800/20 rounded-xl p-2.5 text-center">
              <div className="text-base mb-1">{item.icon}</div>
              <div className="text-sky-300 text-xs font-medium">{item.label}</div>
              <div className="text-white text-xs font-semibold mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Prédictions de course Garmin */}
      {predictions && (
        <div className="bg-black/20 border border-white/6 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              Prédictions Garmin — plat
            </span>
            <span className="text-[10px] text-slate-600">
              {predictions.source === 'garmin'
                ? 'Firstbeat Analytics'
                : predictions.source === 'computed'
                  ? 'Calculé depuis VO2max'
                  : 'Indisponible'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '5K', value: predictions.fiveK },
              { label: '10K', value: predictions.tenK },
              { label: 'Semi', value: predictions.halfMarathon },
              { label: 'Marathon', value: predictions.marathon },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-slate-500 text-[10px] mb-0.5">{label}</div>
                <div className="text-white text-sm font-semibold">
                  {value ? formatRaceTime(value) : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton sync */}
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={syncing}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50
                   text-white font-semibold text-sm transition-all flex items-center justify-center gap-2"
      >
        {syncing ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Synchronisation…
          </>
        ) : (
          'Synchroniser les données Garmin'
        )}
      </button>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function GarminConnect() {
  const { isConnected } = useGarminStore()
  const [showForm, setShowForm] = useState(!isConnected())

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setShowForm(v => !v)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-950/60 border border-sky-800/40 flex items-center justify-center text-lg shrink-0">
            🏔️
          </div>
          <div className="text-left">
            <h3 className="text-slate-200 font-semibold text-sm">Garmin Connect</h3>
            <p className="text-slate-500 text-xs">
              {isConnected()
                ? 'Connecté — données FIT brutes disponibles'
                : 'Données brutes + Running Power + Cadence + HRM-Pro'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConnected() && (
            <span className="text-xs px-2 py-0.5 bg-sky-900/40 text-sky-400 rounded-full border border-sky-800/40">
              ✅ Connecté
            </span>
          )}
          <span className="text-slate-500 text-xs">{showForm ? '▲' : '▼'}</span>
        </div>
      </button>

      {showForm && (
        <div className="mt-4 pt-4 border-t border-white/6">
          {isConnected() ? (
            <GarminSyncPanel />
          ) : (
            <GarminLoginForm onConnected={() => setShowForm(false)} />
          )}
        </div>
      )}
    </div>
  )
}
