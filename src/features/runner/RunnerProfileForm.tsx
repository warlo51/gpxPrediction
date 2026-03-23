/**
 * Formulaire profil coureur — simplifié
 * Saisie manuelle : uniquement les données non déductibles (poids, FC repos, seuil marche, nom)
 * Données calibrées : affichées en lecture seule avec badge source
 */

import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import { calibrateRunner } from '@/services/calibration.service'
import { RunnerAnalysisPanel } from './RunnerAnalysis'

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
    <div className="bg-white/3 border border-white/6 rounded-xl p-3 hover:bg-white/5 transition-colors">
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

  const [name, setName] = useState(profile.name)
  const [weightKg, setWeightKg] = useState(profile.energyModel.weightKg)
  const [restingHR, setRestingHR] = useState(profile.heartRateModel.restingHR)
  const [walkingThreshold, setWalkingThreshold] = useState(profile.speedModel.walkingThresholdGrade)
  const [saved, setSaved] = useState(false)
  const [recalibrated, setRecalibrated] = useState(false)
  const [isRecalibrating, setIsRecalibrating] = useState(false)

  const hasHistory = sessions.length > 0

  // ── Grade max réellement observé dans les streams
  const maxObservedGrade = (() => {
    let max = 0
    for (const s of sessions) {
      // Priorité 1 : grade_smooth (stream Strava lissé, le plus fiable)
      if (s.streams?.grade_smooth?.length) {
        for (const g of s.streams.grade_smooth) {
          const abs = Math.abs(g)
          if (abs < 60 && abs > max) max = abs
        }
        continue
      }
      // Priorité 2 : calcul depuis altitude + distance
      const { distance: dist, altitude: alt } = s.streams ?? {}
      if (dist && alt && dist.length > 5) {
        for (let i = 5; i < dist.length; i++) {
          const dDist = dist[i]! - dist[i - 5]!
          const dAlt = alt[i]! - alt[i - 5]!
          if (dDist < 2) continue
          const g = Math.abs((dAlt / dDist) * 100)
          if (g < 60 && g > max) max = g
        }
        continue
      }
      // Priorité 3 : estimation grossière depuis D+/distance (si pas de streams)
      if (s.elevationGain > 0 && s.distance > 0) {
        // D+/distance * 2 ≈ pente max estimée (hypothèse : montée concentrée sur la moitié du parcours)
        const estimated = (s.elevationGain / (s.distance / 2)) * 100
        if (estimated < 60 && estimated > max) max = estimated
      }
    }
    return Math.round(max)
  })()

  // ── Confiance dans le seuil de marche
  const DEFAULT_WALKING_THRESHOLD = 25
  const currentThreshold = profile.speedModel.walkingThresholdGrade
  const thresholdDiffersFromDefault = currentThreshold !== DEFAULT_WALKING_THRESHOLD
  const sessionsWithStreams = sessions.filter(s => s.streams?.grade_smooth?.length || s.streams?.altitude?.length).length
  const hasEnoughGrade = maxObservedGrade >= 12 && sessionsWithStreams >= 2
  const walkingThresholdCalibrated = hasHistory && thresholdDiffersFromDefault && hasEnoughGrade
  const walkingThresholdUnreliable = hasHistory && thresholdDiffersFromDefault && !hasEnoughGrade

  const sessionsWithElevation = sessions.filter(s => s.streams?.altitude && s.elevationGain > 50).length
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
    if (sessions.length === 0) return
    setIsRecalibrating(true)

    // Construire le profil de base avec les valeurs manuelles actuelles
    const baseForCalibration = {
      ...profile,
      name,
      energyModel: { ...profile.energyModel, weightKg },
      heartRateModel: { ...profile.heartRateModel, restingHR },
      speedModel: { ...profile.speedModel, walkingThresholdGrade: walkingThreshold },
    }

    // Lancer la calibration (légèrement différé pour laisser le spinner s'afficher)
    setTimeout(() => {
      const recalibratedProfile = calibrateRunner(sessions, baseForCalibration)
      setProfile(recalibratedProfile)

      // Resynchroniser les états locaux avec le profil recalibré
      setName(recalibratedProfile.name)
      setWeightKg(recalibratedProfile.energyModel.weightKg)
      setRestingHR(recalibratedProfile.heartRateModel.restingHR)
      setWalkingThreshold(recalibratedProfile.speedModel.walkingThresholdGrade)

      setIsRecalibrating(false)
      setRecalibrated(true)
      setTimeout(() => setRecalibrated(false), 3000)
    }, 50)
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

          {walkingThresholdCalibrated ? (
            /* ── Calibré et fiable ── */
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Seuil de marche <span className="ml-1 text-slate-600 normal-case font-normal">(% pente)</span>
              </label>
              <Calibrated
                label="Seuil détecté automatiquement"
                value={`${currentThreshold} %`}
                sub={`Depuis ${sessionsWithElevation} séance${sessionsWithElevation > 1 ? 's' : ''} · pente max observée ${maxObservedGrade}%`}
                color="text-orange-300"
                source="strava"
              />
            </div>
          ) : walkingThresholdUnreliable ? (
            /* ── Valeur présente mais pas assez de données GPS pour confirmer ── */
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Seuil de marche <span className="ml-1 text-slate-600 normal-case font-normal">(% pente)</span>
              </label>
              <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-bold text-sm">{currentThreshold} %</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900/40 text-amber-500 border border-amber-800/40">
                    ⚠️ Non confirmé
                  </span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  {sessionsWithStreams === 0
                    ? <>Aucun stream GPS détaillé dans vos séances — la détection point par point est impossible. Valeur estimée depuis le D+ moyen ({maxObservedGrade > 0 ? `~${maxObservedGrade}% max estimé` : 'D+ insuffisant'}).</>
                    : <>Pente max observée : <strong className="text-amber-500">{maxObservedGrade}%</strong> — pas assez raide pour confirmer le seuil de marche ({sessionsWithStreams} séance{sessionsWithStreams > 1 ? 's' : ''} avec streams).</>
                  }
                  {' '}Ajustez manuellement si nécessaire.
                </p>
                <NumberInput
                  value={walkingThreshold} min={5} max={50} step={1}
                  onChange={setWalkingThreshold}
                />
              </div>
            </div>
          ) : (
            /* ── Non calibré → input éditable ── */
            <Field
              label="Seuil de marche"
              unit="% pente"
              hint={
                hasHistory && sessionsWithStreams === 0 && maxObservedGrade > 0
                  ? `Pente max estimée depuis votre D+ : ~${maxObservedGrade}% — streams GPS requis pour la détection automatique`
                  : hasHistory && maxObservedGrade > 0
                    ? `Pente max observée : ${maxObservedGrade}% — insuffisant pour auto-détecter (besoin de ≥12% avec streams)`
                    : 'Pente à partir de laquelle vous marchez — sera auto-détecté avec des séances avec D+ et streams GPS'
              }
            >
              <NumberInput
                value={walkingThreshold} min={5} max={50} step={1}
                onChange={setWalkingThreshold}
              />
            </Field>
          )}
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
                disabled={isRecalibrating}
                className={[
                  'w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2',
                  recalibrated
                    ? 'bg-emerald-600 text-white'
                    : isRecalibrating
                      ? 'bg-orange-800 text-orange-200 opacity-80 cursor-wait'
                      : 'bg-orange-600 hover:bg-orange-500 text-white',
                ].join(' ')}
              >
                {isRecalibrating ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Calibration…
                  </>
                ) : recalibrated ? (
                  '✅ Profil recalibré !'
                ) : (
                  `🔁 Recalibrer depuis l'historique (${sessions.length} séances)`
                )}
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

      {/* ── Bloc 3 : Analyse poussée ── */}
      <div className="flex items-center gap-3 mt-2">
        <div className="flex-1 h-px bg-white/6" />
        <span className="text-slate-500 text-xs uppercase tracking-widest font-medium">Analyse du profil</span>
        <div className="flex-1 h-px bg-white/6" />
      </div>

      <RunnerAnalysisPanel />
    </div>
  )
}
