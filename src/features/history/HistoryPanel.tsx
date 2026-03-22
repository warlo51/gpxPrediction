/**
 * Panel historique : ajout de séances manuelles + calibration automatique du profil
 */

import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { calibrateRunner, getCalibrationSummary } from '@/services/calibration.service'
import { formatPace } from '@/services/simulationEngine.service'
import { StravaConnect } from '@/features/strava/StravaConnect'
import type { TrainingSession } from '@/types'

// ─── Formulaire d'ajout de séance ────────────────────────────────────────────

type SessionDraft = {
  name: string
  date: string
  distanceKm: string
  durationMin: string
  elevationGain: string
  avgHeartRate: string
  maxHeartRate: string
}

const EMPTY_DRAFT: SessionDraft = {
  name: '',
  date: new Date().toISOString().split('T')[0] ?? '',
  distanceKm: '',
  durationMin: '',
  elevationGain: '',
  avgHeartRate: '',
  maxHeartRate: '',
}

function SessionForm({ onAdd }: { onAdd: (s: TrainingSession) => void }) {
  const [draft, setDraft] = useState<SessionDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)

  function set(key: keyof SessionDraft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  function handleSubmit() {
    const distanceM = parseFloat(draft.distanceKm) * 1000
    const durationSec = parseFloat(draft.durationMin) * 60
    const elevGain = parseFloat(draft.elevationGain) || 0

    if (isNaN(distanceM) || distanceM <= 0) {
      setError('La distance est requise.')
      return
    }
    if (isNaN(durationSec) || durationSec <= 0) {
      setError('La durée est requise.')
      return
    }

    const avgPace = durationSec / (distanceM / 1000) // s/km

    const session: TrainingSession = {
      id: `manual-${Date.now()}`,
      name: draft.name || `Séance du ${draft.date}`,
      date: new Date(draft.date),
      source: 'manual',
      distance: distanceM,
      duration: durationSec,
      elevationGain: elevGain,
      avgPace,
      avgHeartRate: draft.avgHeartRate ? parseFloat(draft.avgHeartRate) : undefined,
      maxHeartRate: draft.maxHeartRate ? parseFloat(draft.maxHeartRate) : undefined,
    }

    onAdd(session)
    setDraft(EMPTY_DRAFT)
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-5">
      <h3 className="text-slate-200 font-semibold mb-4">➕ Ajouter une séance</h3>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <FormField label="Nom de la séance">
          <TextInput
            placeholder="Ex : Sortie longue dimanche"
            value={draft.name}
            onChange={(v) => set('name', v)}
          />
        </FormField>
        <FormField label="Date">
          <TextInput type="date" value={draft.date} onChange={(v) => set('date', v)} />
        </FormField>
        <FormField label="Distance" unit="km">
          <TextInput
            type="number" placeholder="Ex : 25"
            value={draft.distanceKm} onChange={(v) => set('distanceKm', v)}
          />
        </FormField>
        <FormField label="Durée" unit="minutes">
          <TextInput
            type="number" placeholder="Ex : 180"
            value={draft.durationMin} onChange={(v) => set('durationMin', v)}
          />
        </FormField>
        <FormField label="Dénivelé +" unit="m">
          <TextInput
            type="number" placeholder="Ex : 1200"
            value={draft.elevationGain} onChange={(v) => set('elevationGain', v)}
          />
        </FormField>
        <FormField label="FC moyenne" unit="bpm (optionnel)">
          <TextInput
            type="number" placeholder="Ex : 152"
            value={draft.avgHeartRate} onChange={(v) => set('avgHeartRate', v)}
          />
        </FormField>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3">⚠️ {error}</p>
      )}

      <button
        onClick={handleSubmit}
        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                   font-semibold rounded-xl transition-colors"
      >
        Ajouter la séance
      </button>
    </div>
  )
}

// ─── Liste des séances ────────────────────────────────────────────────────────

function SessionList({
  sessions,
  onRemove,
}: {
  sessions: TrainingSession[]
  onRemove: (id: string) => void
}) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <div className="text-4xl mb-2">📋</div>
        <p>Aucune séance dans l'historique.</p>
        <p className="text-sm mt-1">Ajoutez des séances manuellement pour calibrer votre profil.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-4">
      <h3 className="text-slate-300 font-semibold text-sm uppercase tracking-wide mb-3">
        Historique ({sessions.length} séance{sessions.length > 1 ? 's' : ''})
      </h3>

      {/* Vue cartes sur mobile */}
      <div className="flex flex-col gap-2 sm:hidden">
        {[...sessions]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .map((s) => (
            <div key={s.id} className="bg-slate-900/60 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-slate-200 font-medium text-sm truncate">{s.name}</div>
                  <div className="text-slate-500 text-xs">{new Date(s.date).toLocaleDateString('fr-FR')}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SourceBadge source={s.source} />
                  <button onClick={() => onRemove(s.id)} className="text-slate-600 hover:text-red-400 transition-colors text-xs">✕</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-slate-500">Distance</div>
                  <div className="text-white font-medium">{(s.distance / 1000).toFixed(1)} km</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500">D+</div>
                  <div className="text-orange-400 font-medium">+{Math.round(s.elevationGain)} m</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500">Allure</div>
                  <div className="text-indigo-300 font-medium">{formatPace(s.avgPace)}</div>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Vue tableau sur desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs text-slate-400">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="text-left pb-2 pr-3">Séance</th>
              <th className="text-left pb-2 pr-3">Date</th>
              <th className="text-right pb-2 pr-3">Distance</th>
              <th className="text-right pb-2 pr-3">Durée</th>
              <th className="text-right pb-2 pr-3">D+</th>
              <th className="text-right pb-2 pr-3">Allure moy.</th>
              <th className="text-right pb-2 pr-3">FC moy.</th>
              <th className="text-right pb-2">Source</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {[...sessions]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((s) => (
                <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 pr-3 text-slate-200 font-medium max-w-35 truncate">{s.name}</td>
                  <td className="py-2 pr-3">{new Date(s.date).toLocaleDateString('fr-FR')}</td>
                  <td className="py-2 pr-3 text-right">{(s.distance / 1000).toFixed(1)} km</td>
                  <td className="py-2 pr-3 text-right">
                    {Math.floor(s.duration / 3600)}h{String(Math.floor((s.duration % 3600) / 60)).padStart(2, '0')}
                  </td>
                  <td className="py-2 pr-3 text-right text-orange-400">+{Math.round(s.elevationGain)} m</td>
                  <td className="py-2 pr-3 text-right text-indigo-300">{formatPace(s.avgPace)}</td>
                  <td className="py-2 pr-3 text-right text-rose-300">
                    {s.avgHeartRate ? `${Math.round(s.avgHeartRate)} bpm` : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right"><SourceBadge source={s.source} /></td>
                  <td className="py-2 text-right">
                    <button onClick={() => onRemove(s.id)} className="text-slate-600 hover:text-red-400 transition-colors">✕</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Panneau de calibration ───────────────────────────────────────────────────

function CalibrationPanel() {
  const { sessions, profile, setProfile } = useAppStore()
  const [calibrated, setCalibrated] = useState(false)

  const summary = getCalibrationSummary(sessions, profile)

  const confidenceLabel: Record<string, string> = {
    faible: 'Faible',
    moyenne: 'Moyenne',
    elevee: 'Elevée',
  }

  const confidenceColor: Record<string, string> = {
    faible: 'text-red-400',
    moyenne: 'text-amber-400',
    elevee: 'text-emerald-400',
  }

  function handleCalibrate() {
    const newProfile = calibrateRunner(sessions, profile)
    setProfile(newProfile)
    setCalibrated(true)
    setTimeout(() => setCalibrated(false), 3000)
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-5">
      <h3 className="text-slate-200 font-semibold mb-4">🧠 Calibration automatique</h3>

      {/* Résumé de la qualité */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Séances" value={`${summary.sessionCount}`} />
        <MiniStat label="Avec streams" value={`${summary.sessionsWithStreams}`} />
        <MiniStat label="Avec FC" value={`${summary.sessionsWithHR}`} />
        <div className="bg-slate-900/60 rounded-xl p-3 text-center">
          <div className="text-slate-500 text-xs mb-1">Confiance</div>
          <div className={`font-bold text-sm ${confidenceColor[summary.confidence] ?? 'text-white'}`}>
            {confidenceLabel[summary.confidence] ?? summary.confidence}
          </div>
        </div>
      </div>

      {/* Profil actuel */}
      {sessions.length > 0 && (
        <div className="bg-slate-900/40 rounded-xl p-4 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-400">
          <div>
            <span className="text-slate-500 block">Vitesse plat calibrée</span>
            <span className="text-white font-semibold">
              {(profile.speedModel.flatSpeed * 3.6).toFixed(1)} km/h
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Allure de base</span>
            <span className="text-indigo-300 font-semibold">
              {formatPace(profile.basePaceSecPerKm)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Score endurance</span>
            <span className="text-emerald-400 font-semibold">
              {(profile.enduranceScore * 100).toFixed(0)} %
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Décroissance montée</span>
            <span className="text-white font-semibold">
              -{(profile.speedModel.uphillDecayFactor * 100).toFixed(1)} %/% pente
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Fatigue horaire</span>
            <span className="text-amber-400 font-semibold">
              -{(profile.fatigueModel.hourlyDecayFactor * 100).toFixed(1)} %/h
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Calibré le</span>
            <span className="text-white font-semibold">
              {new Date(profile.calibratedAt).toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Ajoutez au moins une séance pour lancer la calibration.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <button
            onClick={handleCalibrate}
            className={[
              'px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300',
              calibrated
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white',
            ].join(' ')}
          >
            {calibrated ? '✅ Profil calibré !' : '🔁 Calibrer le profil'}
          </button>
          <p className="text-slate-500 text-xs">
            Analyse {sessions.length} séance{sessions.length > 1 ? 's' : ''} et met à jour
            votre profil automatiquement.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function HistoryPanel() {
  const { sessions, addSession, removeSession } = useAppStore()

  return (
    <div className="w-full flex flex-col gap-6">
      <StravaConnect />
      <CalibrationPanel />
      <SessionForm onAdd={addSession} />
      <SessionList sessions={sessions} onRemove={removeSession} />
    </div>
  )
}

// ─── Composants UI réutilisables ──────────────────────────────────────────────

function FormField({
  label, unit, children,
}: {
  label: string
  unit?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
        {unit && <span className="ml-1 text-slate-600 normal-case font-normal">({unit})</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm
                 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                 transition-colors w-full placeholder:text-slate-600"
    />
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/60 rounded-xl p-3 text-center">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className="text-white font-bold text-sm">{value}</div>
    </div>
  )
}

function SourceBadge({ source }: { source: TrainingSession['source'] }) {
  const styles: Record<TrainingSession['source'], string> = {
    manual: 'bg-slate-700 text-slate-300',
    strava: 'bg-orange-900/50 text-orange-400',
    gpx: 'bg-indigo-900/50 text-indigo-400',
  }
  const labels: Record<TrainingSession['source'], string> = {
    manual: 'Manuel',
    strava: 'Strava',
    gpx: 'GPX',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[source]}`}>
      {labels[source]}
    </span>
  )
}
