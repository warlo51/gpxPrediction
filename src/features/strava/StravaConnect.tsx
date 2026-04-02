/**
 * Composant de connexion Strava
 * - Formulaire Client ID / Client Secret saisis par l'utilisateur
 * - Bouton "Connecter Strava" → redirect OAuth
 * - Gestion du callback (code dans l'URL)
 * - Import des activités avec progression
 */

import { useState, useEffect, useCallback } from 'react'
import { useStravaStore } from '@/stores/stravaStore'
import { useAppStore } from '@/stores/appStore'
import { useAuthStore } from '@/stores/authStore'
import {
  buildStravaAuthUrl,
  exchangeCodeForToken,
  refreshTokenIfNeeded,
  fetchStravaActivities,
  fetchActivityStreams,
  mapActivityToSession,
} from '@/services/strava.service'
import { calibrateRunner } from '@/services/calibration.service'
import { saveSessions, saveRunnerProfile, saveStravaConnection } from '@/services/supabase.service'

// ─── Hook : gestion du callback OAuth ────────────────────────────────────────

/**
 * Détecte le ?code= dans l'URL après le redirect Strava
 * et échange le code contre un token.
 */
function useStravaCallback() {
  const { credentials, setToken, setAthlete } = useStravaStore()
  const [callbackError, setCallbackError] = useState<string | null>(null)
  const [isExchanging, setIsExchanging] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      setCallbackError('Autorisation refusée par Strava.')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    if (!code || !credentials) return

    // Nettoyer l'URL immédiatement
    window.history.replaceState({}, '', window.location.pathname)

    setIsExchanging(true)
    exchangeCodeForToken(code, credentials)
      .then(({ token, athlete }) => {
        setToken(token)
        setAthlete(athlete)
        // Sauvegarder la connexion en DB pour tout utilisateur authentifié
        const { user } = useAuthStore.getState()
        if (user) {
          saveStravaConnection(user.id, { credentials, token, athlete }).catch(() => {})
        }
      })
      .catch((err: unknown) => {
        setCallbackError(err instanceof Error ? err.message : 'Erreur OAuth Strava')
      })
      .finally(() => setIsExchanging(false))
  }, [credentials, setToken, setAthlete])

  return { callbackError, isExchanging }
}

// ─── Formulaire de credentials ────────────────────────────────────────────────

function CredentialsForm({ onSaved }: { onSaved: () => void }) {
  const { credentials, setCredentials } = useStravaStore()
  const [clientId, setClientId] = useState(credentials?.clientId ?? '')
  const [clientSecret, setClientSecret] = useState(credentials?.clientSecret ?? '')
  const [showSecret, setShowSecret] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    if (!clientId.trim()) { setError('Le Client ID est requis.'); return }
    if (!clientSecret.trim()) { setError('Le Client Secret est requis.'); return }

    // redirectUri recalculé dynamiquement — pas stocké, toujours basé sur l'origine courante
    const redirectUri = `${window.location.origin}/strava/callback`
    setCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), redirectUri })
    setError(null)
    onSaved()
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-blue-300 font-semibold"
        >
          <span>📋 Comment obtenir vos clés Strava ?</span>
          <span className="text-blue-500 text-xs">{showGuide ? '▲ Masquer' : '▼ Afficher'}</span>
        </button>
        {showGuide && (
          <ol className="list-decimal list-inside space-y-1.5 text-blue-400 text-xs px-4 pb-4">
            <li>Allez sur <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer" className="underline hover:text-blue-200">strava.com/settings/api</a></li>
            <li>Créez une application (nom libre, catégorie "Other")</li>
            <li>
              Renseignez <strong className="text-blue-200">Authorization Callback Domain</strong> :{' '}
              <code className="bg-blue-900/40 px-1 rounded break-all">{window.location.hostname}</code>
            </li>
            <li>
              L'URL de callback complète sera :{' '}
              <code className="bg-blue-900/40 px-1 rounded break-all text-emerald-300">
                {window.location.origin}/strava/callback
              </code>
            </li>
            <li>Copiez le <strong className="text-blue-200">Client ID</strong> et le <strong className="text-blue-200">Client Secret</strong> ci-dessous</li>
          </ol>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Client ID
          </label>
          <input
            type="text"
            placeholder="Ex : 123456"
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setError(null) }}
            className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm
                       focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 hover:border-white/20
                       transition-colors placeholder:text-slate-600"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            Client Secret
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              placeholder="••••••••••••••••••••"
              value={clientSecret}
              onChange={(e) => { setClientSecret(e.target.value); setError(null) }}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-10 text-white text-sm
                         focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 hover:border-white/20
                         transition-colors placeholder:text-slate-600 w-full"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              {showSecret ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">⚠️ {error}</p>}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <button
          onClick={handleSave}
          className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm
                     font-semibold rounded-xl transition-colors"
        >
          Enregistrer et continuer →
        </button>
        <p className="text-xs text-slate-600 text-center sm:text-left">
          Vos identifiants sont stockes de maniere securisee sur votre compte.
        </p>
      </div>
    </div>
  )
}

// ─── Sélecteur de jours de la semaine ────────────────────────────────────────

const DAYS = [
  { key: 1, label: 'Lun', full: 'Lundi' },
  { key: 2, label: 'Mar', full: 'Mardi' },
  { key: 3, label: 'Mer', full: 'Mercredi' },
  { key: 4, label: 'Jeu', full: 'Jeudi' },
  { key: 5, label: 'Ven', full: 'Vendredi' },
  { key: 6, label: 'Sam', full: 'Samedi' },
  { key: 0, label: 'Dim', full: 'Dimanche' },
]

function DayFilter({
  selected,
  onChange,
}: {
  selected: Set<number>
  onChange: (days: Set<number>) => void
}) {
  function toggle(day: number) {
    const next = new Set(selected)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    onChange(next)
  }

  function selectAll() { onChange(new Set(DAYS.map(d => d.key))) }
  function clearAll() { onChange(new Set()) }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          Filtrer par jour de la semaine
        </span>
        <div className="flex gap-2 text-xs">
          <button
            onClick={selectAll}
            className="text-slate-500 hover:text-white transition-colors"
          >
            Tous
          </button>
          <span className="text-slate-700">·</span>
          <button
            onClick={clearAll}
            className="text-slate-500 hover:text-white transition-colors"
          >
            Aucun
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS.map(d => {
          const active = selected.has(d.key)
          return (
            <button
              key={d.key}
              onClick={() => toggle(d.key)}
              title={d.full}
              className={[
                'rounded-lg py-2 text-xs font-semibold transition-all duration-150 select-none',
                active
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-900/40'
                  : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300 border border-white/6',
              ].join(' ')}
            >
              {d.label}
            </button>
          )
        })}
      </div>

      {selected.size === 0 && (
        <p className="text-xs text-amber-400/80">
          ⚠️ Aucun jour sélectionné — sélectionnez au moins un jour ou tous pour importer.
        </p>
      )}
      {selected.size > 0 && selected.size < 7 && (
        <p className="text-xs text-slate-600">
          Seules les activités du {[...selected]
            .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
            .map(k => DAYS.find(d => d.key === k)!.full)
            .join(', ')} seront importées.
        </p>
      )}
      {selected.size === 7 && (
        <p className="text-xs text-slate-600">
          Tous les jours — aucun filtre appliqué.
        </p>
      )}
    </div>
  )
}

// ─── Import des activités ─────────────────────────────────────────────────────

type ImportState =
  | { phase: 'idle' }
  | { phase: 'fetching'; loaded: number }
  | { phase: 'streams'; current: number; total: number }
  | { phase: 'calibrating' }
  | { phase: 'done'; imported: number; skipped: number; filteredOut: number; streamsLoaded: number; withElevation: number }
  | { phase: 'error'; message: string }

function StravaImportPanel() {
  const { token, credentials, athlete, disconnect } = useStravaStore()
  const { sessions, addSession, clearSessions, profile, setProfile } = useAppStore()
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' })
  // Tous les jours sélectionnés par défaut
  const [selectedDays, setSelectedDays] = useState<Set<number>>(
    new Set(DAYS.map(d => d.key))
  )

  // Stats des sessions déjà chargées
  const sessionsWithStreams = sessions.filter(s => s.streams?.distance).length
  const sessionsWithElevation = sessions.filter(s => s.streams?.altitude && s.elevationGain > 50).length

  const handleImport = useCallback(async () => {
    if (!token || !credentials) return
    // Bloquer si aucun jour sélectionné
    if (selectedDays.size === 0) return
    try {
      const freshToken = await refreshTokenIfNeeded(token, credentials)
      useStravaStore.getState().setToken(freshToken)

      // 1. Liste des activités
      setImportState({ phase: 'fetching', loaded: 0 })
      const activities = await fetchStravaActivities(
        freshToken.accessToken,
        (loaded) => setImportState({ phase: 'fetching', loaded }),
      )

      // Nettoyer les sessions demo avant le premier import réel
      const hasRealSessions = sessions.some(s => s.source === 'strava')
      if (!hasRealSessions) {
        clearSessions()
      }

      // Recalculer les IDs existants depuis le store actuel (après éventuel clear)
      const currentSessions = useAppStore.getState().sessions
      const existingIds = new Set(currentSessions.filter(s => s.stravaId).map(s => s.stravaId))

      // Filtrer par jour de la semaine si moins de 7 jours sélectionnés
      const activitiesFiltered = selectedDays.size === 7
        ? activities
        : activities.filter(a => {
            const day = new Date(a.start_date_local ?? a.start_date).getDay()
            return selectedDays.has(day)
          })

      const newActivities = activitiesFiltered.filter(a => !existingIds.has(a.id))
      const skippedAlreadyPresent = activities.filter(a => existingIds.has(a.id)).length
      const filteredOut = activities.length - activitiesFiltered.length

      if (newActivities.length === 0) {
        setImportState({
          phase: 'done',
          imported: 0,
          skipped: skippedAlreadyPresent,
          filteredOut,
          streamsLoaded: sessionsWithStreams,
          withElevation: sessionsWithElevation,
        })
        return
      }

      // 2. Streams pour chaque activité
      const newSessions = []
      let streamsLoaded = 0
      let withElevation = 0

      for (let i = 0; i < newActivities.length; i++) {
        const activity = newActivities[i]!
        setImportState({ phase: 'streams', current: i + 1, total: newActivities.length })

        const streams = await fetchActivityStreams(activity.id, freshToken.accessToken)
        const session = mapActivityToSession(activity, streams ?? undefined)
        addSession(session)
        newSessions.push(session)

        if (streams) {
          streamsLoaded++
          if (activity.total_elevation_gain > 50) withElevation++
        }

        if (i < newActivities.length - 1) {
          await new Promise(r => setTimeout(r, 200))
        }
      }

      // 3. Calibration automatique (uniquement sur les sessions réelles)
      setImportState({ phase: 'calibrating' })
      const allRealSessions = useAppStore.getState().sessions
      const calibrated = calibrateRunner(allRealSessions, profile)
      setProfile(calibrated)

      // 4. Sauvegarder en DB pour tout utilisateur authentifié
      const { user } = useAuthStore.getState()
      if (user) {
        saveSessions(user.id, newSessions).catch((err) =>
          console.error('Erreur sauvegarde sessions DB:', err),
        )
        saveRunnerProfile(user.id, calibrated).catch((err) =>
          console.error('Erreur sauvegarde profil DB:', err),
        )
      }

      setImportState({
        phase: 'done',
        imported: newActivities.length,
        skipped: skippedAlreadyPresent,
        filteredOut,
        streamsLoaded: sessionsWithStreams + streamsLoaded,
        withElevation: sessionsWithElevation + withElevation,
      })
    } catch (err) {
      setImportState({ phase: 'error', message: err instanceof Error ? err.message : "Erreur lors de l'import" })
    }
  }, [token, credentials, sessions, addSession, clearSessions, profile, setProfile, sessionsWithStreams, sessionsWithElevation, selectedDays])

  if (!athlete || !token) return null

  const isImporting = ['fetching', 'streams', 'calibrating'].includes(importState.phase)

  return (
    <div className="space-y-4">
      {/* Profil connecté */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-black/20 border border-white/4 rounded-xl p-3 sm:p-4">
        <div className="flex items-center gap-3 min-w-0">
          <img src={athlete.profile} alt={athlete.firstname}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-orange-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{athlete.firstname} {athlete.lastname}</div>
            <div className="text-slate-500 text-xs truncate">
              {athlete.city ?? ''}{athlete.city && athlete.country ? ', ' : ''}{athlete.country ?? ''}
            </div>
          </div>
          <span className="shrink-0 text-xs px-2 py-0.5 bg-orange-900/40 text-orange-400 rounded-full font-medium">✅ Connecté</span>
        </div>
        <button onClick={disconnect} className="text-xs text-slate-500 hover:text-red-400 transition-colors shrink-0">
          Déconnecter
        </button>
      </div>

      {/* Stats des données disponibles pour la calibration */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-white/3 border border-white/6 rounded-xl p-2.5">
            <div className="text-slate-200 font-bold text-lg">{sessions.length}</div>
            <div className="text-slate-500">séances</div>
          </div>
          <div className="bg-white/3 border border-white/6 rounded-xl p-2.5">
            <div className="text-indigo-400 font-bold text-lg">{sessionsWithStreams}</div>
            <div className="text-slate-500">avec streams</div>
          </div>
          <div className="bg-white/3 border border-white/6 rounded-xl p-2.5">
            <div className="text-orange-400 font-bold text-lg">{sessionsWithElevation}</div>
            <div className="text-slate-500">avec D+ &gt; 50m</div>
          </div>
        </div>
      )}

      {/* Indicateur qualité calibration */}
      {sessions.length > 0 && sessionsWithElevation > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3 text-xs text-emerald-400 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">🎯</span>
          <span>
            <strong>{sessionsWithElevation} séance{sessionsWithElevation > 1 ? 's' : ''} avec dénivelé</strong> — la vitesse réelle en montée/descente est analysée point par point pour calibrer votre profil.
            {sessionsWithElevation < 3 && <span className="text-emerald-700 ml-1">Plus vous avez de sorties avec D+, plus la calibration sera précise.</span>}
          </span>
        </div>
      )}
      {sessions.length > 0 && sessionsWithStreams === 0 && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 text-xs text-amber-400 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>Aucun stream chargé — importez vos activités pour activer la calibration vitesse/pente.</span>
        </div>
      )}

      {/* Filtre par jour de la semaine */}
      <div className="bg-black/20 border border-white/4 rounded-xl p-3 sm:p-4">
        <DayFilter selected={selectedDays} onChange={setSelectedDays} />
      </div>

      {/* Bouton import */}
      <button
        onClick={() => { void handleImport() }}
        disabled={isImporting || selectedDays.size === 0}
        className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50
                   text-white font-semibold text-sm transition-all hover:shadow-lg hover:shadow-orange-900/40
                   flex items-center justify-center gap-2"
      >
        {isImporting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {importState.phase === 'calibrating' ? 'Calibration du profil…' : 'Importation en cours…'}
          </>
        ) : selectedDays.size === 0 ? (
          '⚠️ Sélectionnez au moins un jour'
        ) : selectedDays.size === 7 ? (
          `⬇️ ${sessions.length > 0 ? 'Mettre à jour mes activités' : 'Importer mes activités Strava'}`
        ) : (
          `⬇️ Importer les activités — ${[...selectedDays]
            .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
            .map(k => DAYS.find(d => d.key === k)!.label)
            .join(', ')}`
        )}
      </button>

      {/* Barres de progression */}
      {importState.phase === 'fetching' && (
        <ProgressBar label={`Récupération des activités… (${importState.loaded} chargées)`} progress={null} />
      )}
      {importState.phase === 'streams' && (
        <ProgressBar
          label={`Chargement des streams vitesse/altitude… (${importState.current}/${importState.total})`}
          progress={importState.current / importState.total}
        />
      )}
      {importState.phase === 'calibrating' && (
        <ProgressBar label="Analyse vitesse par % de pente et calibration du profil…" progress={null} />
      )}

      {/* Résultat */}
      {importState.phase === 'done' && (
        <div className="space-y-2">
          <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-3 text-sm text-emerald-400">
            ✅{' '}
            {importState.imported > 0
              ? <><strong>{importState.imported}</strong> nouvelle{importState.imported > 1 ? 's' : ''} activité{importState.imported > 1 ? 's' : ''} importée{importState.imported > 1 ? 's' : ''}</>
              : 'Déjà à jour'}
            {importState.skipped > 0 && <span className="text-slate-500 ml-1">({importState.skipped} déjà présentes)</span>}
            {importState.filteredOut > 0 && (
              <span className="text-slate-500 ml-1">
                · {importState.filteredOut} ignorée{importState.filteredOut > 1 ? 's' : ''} (hors jours sélectionnés)
              </span>
            )}
          </div>
          {importState.imported > 0 && (
            <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3 text-xs text-indigo-300 flex items-start gap-2">
              <span className="shrink-0">🧠</span>
              <span>
                Profil recalibré depuis <strong>{importState.streamsLoaded} séances</strong>
                {importState.withElevation > 0 && <> dont <strong className="text-orange-400">{importState.withElevation} avec dénivelé</strong> — votre vitesse réelle en montée/descente est maintenant prise en compte.</>}
                {' '}Consultez l'onglet <strong>Profil coureur</strong> pour voir les valeurs.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Erreur */}
      {importState.phase === 'error' && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 text-sm text-red-400 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{importState.message}</span>
        </div>
      )}
    </div>
  )
}

// ─── Barre de progression ─────────────────────────────────────────────────────

function ProgressBar({ label, progress }: { label: string; progress: number | null }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
        {progress !== null ? (
          <div
            className="h-full bg-linear-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        ) : (
          <div className="h-full bg-linear-to-r from-orange-600 to-orange-400 rounded-full animate-pulse w-1/3" />
        )}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function StravaConnect() {
  const { credentials, token, athlete } = useStravaStore()
  const { callbackError, isExchanging } = useStravaCallback()

  const [forceShowForm, setForceShowForm] = useState(false)

  // Si déjà connecté, aller directement à l'import
  const isConnected = !!(token && athlete)
  // step dérivé du store : si credentials existent → 'connect', sinon → 'credentials'
  // forceShowForm permet de revenir au formulaire via "Modifier"
  const step = (!credentials || forceShowForm) ? 'credentials' : 'connect'

  if (isExchanging) {
    return (
      <div className="flex items-center gap-3 text-slate-400 py-6 justify-center">
        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span>Connexion à Strava en cours…</span>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-950/60 border border-orange-800/40 flex items-center justify-center shrink-0">
          <StravaLogo size={22} />
        </div>
        <div>
          <h3 className="text-white font-semibold">Connexion Strava</h3>
          <p className="text-slate-500 text-xs">
            Importez automatiquement vos runs pour calibrer votre profil
          </p>
        </div>
        {isConnected && (
          <span className="ml-auto text-xs px-2 py-1 rounded-full bg-emerald-900/40 border border-emerald-700/40 text-emerald-400 font-medium shrink-0">
            ✅ Connecté
          </span>
        )}
      </div>

      {callbackError && (
        <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-3 text-sm text-red-400 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          {callbackError}
        </div>
      )}

      {/* Étape 1 : credentials */}
      {!isConnected && step === 'credentials' && (
        <CredentialsForm onSaved={() => setForceShowForm(false)} />
      )}

      {/* Étape 2 : bouton OAuth */}
      {!isConnected && step === 'connect' && credentials && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="text-emerald-400">✓</span>
            Clés enregistrées (Client ID : {credentials.clientId})
            <button
              onClick={() => setForceShowForm(true)}
              className="underline hover:text-slate-300 ml-1"
            >
              Modifier
            </button>
          </div>
          <a
            href={buildStravaAuthUrl(credentials)}
            className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl
                       bg-linear-to-r from-orange-600 to-orange-500
                       hover:from-orange-500 hover:to-orange-400
                       text-white font-semibold text-sm
                       transition-all duration-200 hover:shadow-lg hover:shadow-orange-900/40"
          >
            <StravaLogo size={18} white />
            Autoriser l'accès à mes activités Strava
          </a>
          <p className="text-xs text-slate-600 text-center">
            Vous serez redirigé vers Strava puis revenu ici automatiquement.
          </p>
        </div>
      )}

      {/* Connecté : import */}
      {isConnected && <StravaImportPanel />}
    </div>
  )
}

// ─── Logo Strava SVG ──────────────────────────────────────────────────────────

function StravaLogo({ size = 28, white = false }: { size?: number; white?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z"
        fill={white ? '#fff' : '#FC4C02'}
      />
      <path
        d="M11.094 13.828l2.589-5.111 2.584 5.111h3.065L13.683 3.828 8.035 13.828h3.059z"
        fill={white ? 'rgba(255,255,255,0.7)' : '#FC4C0280'}
      />
    </svg>
  )
}
