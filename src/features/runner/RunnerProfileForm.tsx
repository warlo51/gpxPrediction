/**
 * Formulaire profil coureur — simplifié
 * Saisie manuelle : uniquement les données non déductibles (poids, FC repos, seuil marche, nom)
 * Données calibrées : affichées en lecture seule avec badge source
 */

import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import { calibrateRunner } from '@/services/calibration.service'

// ─── Composants UI ────────────────────────────────────────────────────────────

function NumberInput({
  value, min, max, step = 1, onChange,
}: {
  value: number; min?: number; max?: number; step?: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="number"
      value={value}
      min={min} max={max} step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
                 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 hover:border-white/20/50
                 transition-colors w-full hover:border-white/20"
    />
  )
}

function Field({ label, unit, hint, children }: {
  label: string; unit?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        {label}
        {unit && <span className="ml-1 text-slate-600 normal-case font-normal">({unit})</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
    </div>
  )
}

/** Tuile de donnée calibrée en lecture seule */
function Calibrated({
  label, value, sub, color = 'text-white', source,
}: {
  label: string; value: string; sub?: string
  color?: string; source: 'strava' | 'calculé'
}) {
  return (
    <div className="bg-white/3 border border-white/6 rounded-xl p-3 hover:bg-white/[0.05] transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-slate-500 text-xs leading-tight">{label}</span>
        <span className={[
          'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-1',
          source === 'strava'
            ? 'bg-orange-900/50 text-orange-400 border border-orange-800/40'
            : 'bg-indigo-900/50 text-indigo-400 border border-indigo-800/40',
        ].join(' ')}>
          {source === 'strava' ? '⚡ Strava' : '🧮 Calculé'}
        </span>
      </div>
      <div className={`font-bold text-sm ${color}`}>{value}</div>
      {sub && <div className="text-slate-600 text-xs mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function RunnerProfileForm() {
  const { profile, setProfile, sessions } = useAppStore()
  const { athlete } = useStravaStore()

  // Seuls champs saisis manuellement
  const [name, setName] = useState(profile.name)
  const [weightKg, setWeightKg] = useState(profile.energyModel.weightKg)
  const [restingHR, setRestingHR] = useState(profile.heartRateModel.restingHR)
  const [walkingThreshold, setWalkingThreshold] = useState(
    profile.speedModel.walkingThresholdGrade,
  )
  const [saved, setSaved] = useState(false)

  const hasHistory = sessions.length > 0
  const paceMin = Math.floor(profile.basePaceSecPerKm / 60)
  const paceSec = profile.basePaceSecPerKm % 60

  function handleSave() {
    setProfile({
      ...profile,
      name,
      energyModel: { ...profile.energyModel, weightKg },
      heartRateModel: { ...profile.heartRateModel, restingHR },
      speedModel: { ...profile.speedModel, walkingThresholdGrade: walkingThreshold },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleRecalibrate() {
    const recalibrated = calibrateRunner(sessions, {
      ...profile,
      name,
      energyModel: { ...profile.energyModel, weightKg },
      heartRateModel: { ...profile.heartRateModel, restingHR },
      speedModel: { ...profile.speedModel, walkingThresholdGrade: walkingThreshold },
    })
    setProfile(recalibrated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="w-full flex flex-col gap-6">

      {/* ── Bloc 1 : Saisie manuelle ── */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-lg">🏃</div>
            <div>
              <h2 className="text-white font-bold text-base sm:text-lg">Profil coureur</h2>
              <p className="text-slate-500 text-xs mt-0.5">
                Seules les données non déductibles sont à renseigner.
              </p>
            </div>
          </div>
          {athlete && (
            <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-900/20 px-3 py-1.5 rounded-full">
              <span>⚡</span>
              <span>Calibré depuis Strava ({sessions.length} séances)</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Nom du profil">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm
                         focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 hover:border-white/20
                         transition-colors w-full"
            />
          </Field>

          <Field label="Poids" unit="kg"
            hint="Utilisé pour estimer les calories">
            <NumberInput
              value={weightKg} min={30} max={150} step={0.5}
              onChange={setWeightKg}
            />
          </Field>

          <Field label="FC au repos" unit="bpm"
            hint="Non disponible depuis Strava">
            <NumberInput
              value={restingHR} min={30} max={80}
              onChange={setRestingHR}
            />
          </Field>

          <Field label="Seuil de marche" unit="% pente"
            hint="Pente à partir de laquelle vous marchez">
            <NumberInput
              value={walkingThreshold} min={5} max={50} step={1}
              onChange={setWalkingThreshold}
            />
          </Field>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pt-4 border-t border-white/6">
          <button
            onClick={() => {
              setName(profile.name)
              setWeightKg(profile.energyModel.weightKg)
              setRestingHR(profile.heartRateModel.restingHR)
              setWalkingThreshold(profile.speedModel.walkingThresholdGrade)
            }}
            className="text-sm text-slate-500 hover:text-white transition-colors py-2"
          >
            Annuler
          </button>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {hasHistory && (
              <button
                onClick={handleRecalibrate}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-orange-600 hover:bg-orange-500
                           text-white transition-colors"
              >
                🔁 Recalibrer depuis l'historique
              </button>
            )}
            <button
              onClick={handleSave}
              className={[
                'w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300',
                saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white',
              ].join(' ')}
            >
              {saved ? '✅ Sauvegardé !' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Bloc 2 : Données calibrées (lecture seule) ── */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-orange-500 inline-block" />
            <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">
              Données calibrées automatiquement
            </h3>
          </div>
          {!hasHistory && (
            <span className="text-xs text-slate-600 italic">
              Importez des séances pour améliorer la précision
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          <Calibrated
            label="Allure de base (plat)"
            value={`${paceMin}:${String(paceSec).padStart(2, '0')} /km`}
            sub={`${(profile.speedModel.flatSpeed * 3.6).toFixed(1)} km/h`}
            color="text-indigo-300"
            source={hasHistory ? 'strava' : 'calculé'}
          />
          <Calibrated
            label="FC de base"
            value={`${profile.heartRateModel.baseHR} bpm`}
            sub={`Max: ${profile.heartRateModel.maxHR} bpm`}
            color="text-rose-300"
            source={hasHistory && sessions.some(s => s.avgHeartRate) ? 'strava' : 'calculé'}
          />
          <Calibrated
            label="Score d'endurance"
            value={`${(profile.enduranceScore * 100).toFixed(0)} %`}
            sub={profile.enduranceScore > 0.75 ? 'Très bon' : profile.enduranceScore > 0.55 ? 'Correct' : 'À développer'}
            color="text-emerald-400"
            source={hasHistory ? 'strava' : 'calculé'}
          />
          <Calibrated
            label="Fatigue horaire"
            value={`-${(profile.fatigueModel.hourlyDecayFactor * 100).toFixed(1)} %/h`}
            sub={`Seuil tardif: ${profile.fatigueModel.fatigueThresholdKm} km`}
            color="text-amber-400"
            source={hasHistory ? 'strava' : 'calculé'}
          />
          <Calibrated
            label="Décroissance montée"
            value={`-${(profile.speedModel.uphillDecayFactor * 100).toFixed(1)} %/% pente`}
            source={hasHistory && sessions.some(s => s.streams) ? 'strava' : 'calculé'}
          />
          <Calibrated
            label="Boost descente"
            value={`+${(profile.speedModel.downhillBoostFactor * 100).toFixed(1)} %/% pente`}
            source={hasHistory && sessions.some(s => s.streams) ? 'strava' : 'calculé'}
          />
          <Calibrated
            label="Dérive cardiaque"
            value={`+${profile.heartRateModel.cardiacDriftBpmPerHour} bpm/h`}
            source="calculé"
          />
          <Calibrated
            label="Calibré le"
            value={new Date(profile.calibratedAt).toLocaleDateString('fr-FR')}
            sub={`${profile.sessionCount} séance${profile.sessionCount > 1 ? 's' : ''} analysée${profile.sessionCount > 1 ? 's' : ''}`}
            source={hasHistory ? 'strava' : 'calculé'}
          />
        </div>

        {/* Hint si pas d'historique */}
        {!hasHistory && (
          <div className="mt-4 bg-black/20 border border-white/4 rounded-xl p-3 text-xs text-slate-500 flex items-start gap-2">
            <span className="text-indigo-400 mt-0.5">💡</span>
            <span>
              Connectez votre compte Strava dans l'onglet <strong className="text-slate-400">Historique</strong> pour que
              ces valeurs soient automatiquement calibrées sur vos vraies performances.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
