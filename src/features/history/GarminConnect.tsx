/**
 * Composant connexion Garmin Connect
 * Login/password → tokens stockés dans le store (jamais le mot de passe)
 * Import automatique des activités avec fichiers FIT
 */

import { useState, useCallback } from 'react'
import { useGarminStore } from '@/stores/garminStore'
import { useAppStore } from '@/stores/appStore'
import { calibrateRunner } from '@/services/calibration.service'
import { garminLogin, importGarminActivities } from '@/services/garmin.service'
import type { GarminImportProgress } from '@/services/garmin.service'

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
          Vos identifiants sont envoyés à votre instance Vercel personnelle uniquement — ils ne sont <strong className="text-slate-400">jamais stockés</strong>, ni sur votre appareil ni sur un serveur tiers. Seuls les tokens OAuth sont conservés dans votre navigateur.
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

// ─── Panel d'import ───────────────────────────────────────────────────────────

function GarminImportPanel() {
  const { oauth1, oauth2, profile, disconnect } = useGarminStore()
  const { sessions, addSession, profile: runnerProfile, setProfile } = useAppStore()
  const [importState, setImportState] = useState<GarminImportProgress | null>(null)
  const [lastResult, setLastResult] = useState<{
    imported: number; skipped: number; withFit: number
  } | null>(null)

  const sessionsFromGarmin = sessions.filter(s => s.id.startsWith('garmin-'))

  const handleImport = useCallback(async () => {
    if (!oauth1 || !oauth2) return
    setLastResult(null)

    try {
      const existingIds = new Set(sessions.map(s => s.id))

      const { sessions: newSessions, withFit, skipped } = await importGarminActivities(
        oauth1, oauth2, existingIds,
        (state) => setImportState(state),
      )

      // Ajouter les sessions
      for (const s of newSessions) addSession(s)

      // Recalibrer si nouvelles données
      if (newSessions.length > 0) {
        setImportState({ phase: 'calibrating' })
        const allSessions = [...sessions, ...newSessions]
        const calibrated = calibrateRunner(allSessions, runnerProfile)
        setProfile(calibrated)
      }

      setLastResult({ imported: newSessions.length, skipped, withFit })
      setImportState(null)
    } catch (err) {
      setImportState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Erreur import',
      })
    }
  }, [oauth1, oauth2, sessions, addSession, runnerProfile, setProfile])

  const isImporting = importState !== null && importState.phase !== 'error'

  // Barre de progression
  const progressLabel = importState
    ? importState.phase === 'activities'
      ? `Récupération des activités… ${importState.loaded}/${importState.total}`
      : importState.phase === 'fit'
        ? `FIT ${importState.current}/${importState.total} — ${importState.activityName}`
        : importState.phase === 'calibrating'
          ? 'Calibration du profil avec les données Garmin…'
          : ''
    : ''

  const progressValue = importState
    ? importState.phase === 'activities'
      ? importState.total > 0 ? importState.loaded / importState.total : null
      : importState.phase === 'fit'
        ? importState.current / importState.total
        : null
    : null

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
            <div className="text-slate-500 text-xs">{sessionsFromGarmin.length} séance{sessionsFromGarmin.length > 1 ? 's' : ''} importée{sessionsFromGarmin.length > 1 ? 's' : ''}</div>
          </div>
          <span className="text-xs px-2 py-0.5 bg-sky-900/40 text-sky-400 rounded-full border border-sky-800/40">
            ✅ Connecté
          </span>
        </div>
        <button onClick={disconnect} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
          Déconnecter
        </button>
      </div>

      {/* Avantages données Garmin vs Strava */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: '⚡', label: 'Running Power', sub: 'Epix Pro natif' },
          { icon: '🦵', label: 'Cadence + GCT', sub: 'Ceinture HRM' },
          { icon: '📈', label: 'VO2max Garmin', sub: 'Estimé montre' },
          { icon: '🎯', label: 'Training Effect', sub: 'Aérobie + anaérobie' },
        ].map(item => (
          <div key={item.label} className="bg-sky-950/20 border border-sky-800/20 rounded-xl p-2.5 text-center">
            <div className="text-base mb-1">{item.icon}</div>
            <div className="text-sky-300 text-xs font-medium">{item.label}</div>
            <div className="text-slate-600 text-[10px]">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Bouton import */}
      <button
        onClick={() => void handleImport()}
        disabled={isImporting}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50
                   text-white font-semibold text-sm transition-all flex items-center justify-center gap-2"
      >
        {isImporting ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Import en cours…
          </>
        ) : (
          `⬇️ ${sessionsFromGarmin.length > 0 ? 'Mettre à jour depuis Garmin' : 'Importer mes activités Garmin'}`
        )}
      </button>

      {/* Progression */}
      {isImporting && progressLabel && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-400 truncate">{progressLabel}</p>
          <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
            {progressValue !== null ? (
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-300"
                style={{ width: `${progressValue * 100}%` }}
              />
            ) : (
              <div className="h-full bg-sky-500 rounded-full animate-pulse w-2/5" />
            )}
          </div>
        </div>
      )}

      {/* Erreur */}
      {importState?.phase === 'error' && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3 text-xs text-red-400 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{importState.message}</span>
        </div>
      )}

      {/* Résultat */}
      {lastResult && (
        <div className="space-y-2">
          <div className={[
            'rounded-xl p-3 text-sm flex items-start gap-2',
            lastResult.imported > 0
              ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-400'
              : 'bg-slate-800/50 border border-white/6 text-slate-400',
          ].join(' ')}>
            <span>{lastResult.imported > 0 ? '✅' : 'ℹ️'}</span>
            <span>
              {lastResult.imported > 0
                ? <><strong>{lastResult.imported}</strong> nouvelle{lastResult.imported > 1 ? 's' : ''} activité{lastResult.imported > 1 ? 's' : ''} importée{lastResult.imported > 1 ? 's' : ''}</>
                : 'Déjà à jour —'
              }
              {lastResult.withFit > 0 && (
                <span className="text-sky-400 ml-1">
                  dont <strong>{lastResult.withFit}</strong> avec données FIT complètes
                </span>
              )}
              {lastResult.skipped > 0 && (
                <span className="text-slate-500 ml-1">
                  · {lastResult.skipped} déjà présentes
                </span>
              )}
            </span>
          </div>
          {lastResult.imported > 0 && (
            <div className="bg-sky-950/30 border border-sky-800/40 rounded-xl p-3 text-xs text-sky-400 flex items-start gap-2">
              <span className="shrink-0">🧠</span>
              <span>
                Profil recalibré avec les données brutes Garmin — puissance, cadence et Running Dynamics sont maintenant intégrés dans le modèle de simulation.
              </span>
            </div>
          )}
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
            <GarminImportPanel />
          ) : (
            <GarminLoginForm onConnected={() => setShowForm(false)} />
          )}
        </div>
      )}
    </div>
  )
}
