/**
 * Page Profil Runner — MMA-11
 * Design fidèle à la maquette Figma.
 */

import { useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useStravaStore } from '@/stores/stravaStore'
import { RunnerAnalysisPanel } from '@/features/runner/RunnerAnalysis'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPaceSec(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n))
}

// ─── Estimation VO2max — Formule VDOT de Jack Daniels ────────────────────────

/**
 * Estime le VO2max (VDOT) à partir d'une performance de course.
 * Référence : Daniels' Running Formula, 3rd edition.
 * @param distanceM  distance en mètres
 * @param durationSec  durée en secondes
 * @returns VO2max estimé en mL/kg/min
 */
function estimateVDOT(distanceM: number, durationSec: number): number {
  if (distanceM <= 0 || durationSec <= 0) return 0
  const t = durationSec / 60  // minutes
  const v = distanceM / t     // m/min

  // Coût en O2 à la vitesse v
  const o2cost = -4.60 + 0.182258 * v + 0.000104 * v * v

  // % de VO2max soutenable pour la durée t
  const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t)

  if (pctVO2max <= 0) return 0
  return o2cost / pctVO2max
}

type VO2Data = {
  vo2max: number
  trend: number | null
  percentileLabel: string
  level: string
  history: number[] // 7 valeurs normalisées 0-1 pour le mini chart
}

function computeVO2Data(
  sessions: Array<{ distance: number; duration: number; date: Date; elevationGain: number; avgPace: number }>,
): VO2Data {
  const fallback: VO2Data = {
    vo2max: 0, trend: null, percentileLabel: '', level: 'Beginner',
    history: [0, 0, 0, 0, 0, 0, 0],
  }

  // Filtrer pour des estimations VDOT fiables :
  // 10-120 min, relativement plat (<20 m D+/km), allure valide
  const candidates = sessions
    .filter(s => {
      if (s.distance <= 0 || s.duration <= 0 || s.avgPace <= 0) return false
      const durMin = s.duration / 60
      if (durMin < 10 || durMin > 120) return false
      const distKm = s.distance / 1000
      return distKm > 0 && s.elevationGain / distKm < 20
    })
    .map(s => ({
      vdot: estimateVDOT(s.distance, s.duration),
      dateMs: new Date(s.date).getTime(),
    }))
    .filter(s => s.vdot > 15 && s.vdot < 90) // sanity
    .sort((a, b) => a.dateMs - b.dateMs)

  if (candidates.length === 0) return fallback

  // VO2max = 90e percentile des 20 dernières sessions éligibles (robuste aux outliers)
  const recent = candidates.slice(-20)
  const sortedVdots = [...recent.map(s => s.vdot)].sort((a, b) => a - b)
  const p90Idx = Math.min(sortedVdots.length - 1, Math.floor(sortedVdots.length * 0.9))
  const vo2max = Math.round(sortedVdots[p90Idx]!)

  // Trend : 80e percentile des 8 dernières semaines vs 8 précédentes
  const now = Date.now()
  const ms8w = 56 * 86400000
  const recentV = candidates.filter(s => now - s.dateMs < ms8w).map(s => s.vdot)
  const prevV = candidates.filter(s => {
    const age = now - s.dateMs
    return age >= ms8w && age < ms8w * 2
  }).map(s => s.vdot)

  let trend: number | null = null
  if (recentV.length >= 2 && prevV.length >= 2) {
    const rSorted = [...recentV].sort((a, b) => a - b)
    const pSorted = [...prevV].sort((a, b) => a - b)
    const rP80 = rSorted[Math.floor(rSorted.length * 0.8)]!
    const pP80 = pSorted[Math.floor(pSorted.length * 0.8)]!
    if (pP80 > 0) trend = parseFloat((((rP80 - pP80) / pP80) * 100).toFixed(1))
  }

  // Percentile (population générale, hommes adultes)
  const percentileLabel =
    vo2max >= 65 ? 'TOP 1%' : vo2max >= 60 ? 'TOP 3%'
    : vo2max >= 55 ? 'TOP 5%' : vo2max >= 50 ? 'TOP 15%'
    : vo2max >= 45 ? 'TOP 30%' : vo2max >= 40 ? 'TOP 50%' : ''

  // Niveau
  const level =
    vo2max >= 60 ? 'Elite Level' : vo2max >= 52 ? 'Pro Level'
    : vo2max >= 45 ? 'Advanced' : vo2max >= 38 ? 'Amateur' : 'Beginner'

  // Historique : 80e percentile par période de 4 semaines (7 périodes)
  const ms4w = 28 * 86400000
  const history: number[] = []
  for (let i = 6; i >= 0; i--) {
    const start = now - (i + 1) * ms4w
    const end = now - i * ms4w
    const pVdots = candidates.filter(s => s.dateMs >= start && s.dateMs < end).map(s => s.vdot)
    if (pVdots.length > 0) {
      const s = [...pVdots].sort((a, b) => a - b)
      history.push(s[Math.floor(s.length * 0.8)]!)
    } else {
      history.push(0)
    }
  }

  // Normaliser 0-1 pour le bar chart
  const nonZero = history.filter(h => h > 0)
  if (nonZero.length === 0) return { ...fallback, vo2max, percentileLabel, level }
  const maxH = Math.max(...nonZero)
  const minH = Math.min(...nonZero)
  const range = maxH - minH || 1
  const normalizedHistory = history.map(h =>
    h === 0 ? 0.1 : 0.3 + ((h - minH) / range) * 0.7,
  )

  return { vo2max, trend, percentileLabel, level, history: normalizedHistory }
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function StatCard({
  label, value, unit, accent = '#ff6d00', progress,
}: {
  label: string
  value: string
  unit: string
  accent?: string
  progress?: number // 0–100
}) {
  return (
    <div className="flex flex-col justify-between p-6 rounded-2xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.5)] mb-3">
        {label}
      </p>
      <div className="flex items-end gap-2 mb-4">
        <span className="text-[48px] font-black leading-none text-white">{value}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-[1px] uppercase"
          style={{ color: accent }}>
          {unit}
        </span>
        {progress !== undefined && (
          <div className="flex-1 ml-4 h-[3px] rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: accent }} />
          </div>
        )}
      </div>
    </div>
  )
}

function Vo2Card({ data }: { data: VO2Data }) {
  const { vo2max, trend, percentileLabel, history } = data

  if (vo2max === 0) {
    return (
      <div className="flex flex-col justify-between p-6 rounded-2xl"
        style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.5)] mb-3">
          VO2 Max Trend
        </p>
        <p className="text-[18px] font-black text-[rgba(218,226,253,0.2)] mb-1">—</p>
        <p className="text-[11px] text-[rgba(218,226,253,0.4)]">
          Pas assez de sessions plates (10-120 min) pour estimer
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col justify-between p-6 rounded-2xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-medium tracking-[1.5px] uppercase text-[rgba(218,226,253,0.5)]">
          VO2 Max Trend
        </p>
        {percentileLabel && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: '#ff6d00', color: '#1a0500' }}>
            {percentileLabel}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-[48px] font-black leading-none text-white">{vo2max}</span>
      </div>
      <p className="text-[11px] text-[rgba(218,226,253,0.5)] mb-4">
        {trend !== null
          ? `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}% vs 2 mois précédents`
          : 'Pas assez de données pour la tendance'}
      </p>
      {/* Mini bar chart — historique VDOT sur 7 périodes de 4 semaines */}
      <div className="flex items-end gap-[3px] h-[40px]">
        {history.map((h, i) => (
          <div key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${h * 100}%`,
              background: i === history.length - 1 ? '#ff6d00' : 'rgba(255,255,255,0.12)',
            }}
          />
        ))}
      </div>
    </div>
  )
}


// ─── Calculs dynamiques pour AiStatsCard ─────────────────────────────────────

type AiStats = {
  /** Allure estimée au seuil lactique (s/km) */
  lactateThresholdPace: number
  /** Delta allure seuil vs période précédente (négatif = amélioration) */
  lactateDelta: number | null
  /** Temps marathon prédit via Riegel (secondes) */
  marathonPrediction: number | null
  /** Source de la prédiction ("10K", "Semi", etc.) */
  marathonSource: string | null
  /** Économie de course : allure relative à la FC (s/km par bpm) — plus bas = meilleur */
  runningEconomy: number | null
  /** Delta économie vs période précédente (négatif = amélioration) */
  economyDelta: number | null
  /** Volume hebdo moyen (km) sur les 4 dernières semaines */
  weeklyVolume: number
  /** Delta volume vs 4 semaines précédentes (%) */
  volumeDelta: number | null
  /** Texte insight dynamique */
  insight: string
}

type SessionInput = {
  distance: number; duration: number; date: Date; avgPace: number
  avgHeartRate?: number; elevationGain: number
  streams?: { velocity_smooth?: number[]; grade_smooth?: number[] }
}

/**
 * Extrait l'allure sur les segments plats (-2% à +2%) depuis les streams GPS.
 * Retourne null si pas assez de données flat.
 */
function extractFlatPace(session: SessionInput): number | null {
  const { streams } = session
  if (streams?.velocity_smooth?.length && streams?.grade_smooth?.length) {
    const flatSpeeds: number[] = []
    const len = Math.min(streams.velocity_smooth.length, streams.grade_smooth.length)
    for (let i = 0; i < len; i++) {
      const grade = streams.grade_smooth[i]!
      const speed = streams.velocity_smooth[i]!
      if (Math.abs(grade) <= 2 && speed > 0.5 && speed < 8) {
        flatSpeeds.push(speed)
      }
    }
    if (flatSpeeds.length >= 20) {
      // Médiane pour robustesse aux outliers
      flatSpeeds.sort((a, b) => a - b)
      const median = flatSpeeds[Math.floor(flatSpeeds.length / 2)]!
      return 1000 / median // sec/km
    }
  }
  // Fallback : avgPace uniquement si la séance est plate (<15 m D+/km)
  const distKm = session.distance / 1000
  if (distKm > 0 && session.elevationGain / distKm < 15) {
    return session.avgPace
  }
  return null // trop vallonné sans streams → on ignore
}

function computeAiStats(
  sessions: SessionInput[],
  profile: { basePaceSecPerKm: number; heartRateModel: { restingHR: number; maxHR: number }; enduranceScore: number },
): AiStats {
  const sorted = [...sessions]
    .filter(s => s.avgPace > 0 && s.distance > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // ── Seuil lactique : allure FLAT à ~85% FCR (zone 4 Karvonen) ──
  // Similaire à Garmin : on extrait l'allure sur segments plats des séances à effort seuil
  const { restingHR, maxHR } = profile.heartRateModel
  const fcReserve = maxHR - restingHR
  const z4TargetHR = fcReserve > 0 ? restingHR + fcReserve * 0.85 : maxHR * 0.85

  let lactateThresholdPace = profile.basePaceSecPerKm * 0.88 // fallback
  let lactateDelta: number | null = null

  const sessionsWithHR = sorted.filter(s => s.avgHeartRate)
  if (sessionsWithHR.length >= 3 && fcReserve > 0) {
    // Séances dont FC est entre 75-95% FCR ≈ effort seuil élargi
    const thresholdCandidates = sessionsWithHR
      .filter(s => {
        const pctFCR = (s.avgHeartRate! - restingHR) / fcReserve
        return pctFCR >= 0.75 && pctFCR <= 0.95
      })
      .map(s => {
        const flatPace = extractFlatPace(s)
        return flatPace ? { flatPace, hr: s.avgHeartRate! } : null
      })
      .filter((s): s is { flatPace: number; hr: number } => s !== null)

    if (thresholdCandidates.length >= 2) {
      // Normaliser l'allure plate à la FC cible (85% FCR)
      // FC plus haute → effort plus intense → à la cible il serait plus lent
      const normalizedPaces = thresholdCandidates.map(s =>
        s.flatPace * (s.hr / z4TargetHR),
      )
      lactateThresholdPace = normalizedPaces.reduce((a, b) => a + b, 0) / normalizedPaces.length

      // Delta : dernière moitié vs première moitié
      const half = Math.floor(normalizedPaces.length / 2)
      const oldAvg = normalizedPaces.slice(0, half).reduce((a, b) => a + b, 0) / half
      const newAvg = normalizedPaces.slice(half).reduce((a, b) => a + b, 0) / (normalizedPaces.length - half)
      lactateDelta = Math.round(newAvg - oldAvg) // négatif = amélioration
    }
  }

  // ── Marathon prédit : formule de Riegel (T2 = T1 × (D2/D1)^1.06) ──
  // Chercher le meilleur effort récent entre 5km et 25km (course "plate" : D+/km < 30m)
  let marathonPrediction: number | null = null
  let marathonSource: string | null = null

  const recentFlat = sorted
    .filter(s => {
      const distKm = s.distance / 1000
      if (distKm < 4.5 || distKm > 25) return false
      const elevPerKm = distKm > 0 ? s.elevationGain / distKm : 0
      return elevPerKm < 15 // max 15m D+/km pour un effort "plat"
    })
    .slice(-20)

  if (recentFlat.length > 0) {
    // Meilleure performance = plus rapide avgPace parmi les courses > 5km
    let bestSession = recentFlat[0]!
    for (const s of recentFlat) {
      if (s.avgPace < bestSession.avgPace) bestSession = s
    }
    const refDistKm = bestSession.distance / 1000
    const refTimeSec = bestSession.duration
    // Riegel: T_marathon = T_ref × (42.195 / D_ref)^1.06
    marathonPrediction = refTimeSec * Math.pow(42.195 / refDistKm, 1.06)

    if (refDistKm <= 6) marathonSource = '5K'
    else if (refDistKm <= 12) marathonSource = '10K'
    else if (refDistKm <= 22) marathonSource = 'Semi'
    else marathonSource = `${refDistKm.toFixed(0)}K`
  }

  // ── Économie de course : allure plate normalisée par FC ──
  // Plus la valeur est basse, meilleure est l'économie (vite pour peu de battements)
  let runningEconomy: number | null = null
  let economyDelta: number | null = null

  if (sessionsWithHR.length >= 4) {
    // Utiliser l'allure plate (streams ou sessions plates) pour éviter le biais terrain
    const economies = sessionsWithHR
      .map(s => {
        const flatPace = extractFlatPace(s)
        return flatPace && s.avgHeartRate ? flatPace / s.avgHeartRate : null
      })
      .filter((e): e is number => e !== null)

    if (economies.length >= 4) {
      const half = Math.floor(economies.length / 2)
      const oldEco = economies.slice(0, half).reduce((a, b) => a + b, 0) / half
      const recentEco = economies.slice(half).reduce((a, b) => a + b, 0) / (economies.length - half)
      runningEconomy = recentEco
      economyDelta = oldEco > 0 ? ((recentEco - oldEco) / oldEco) * 100 : null // négatif = amélioration
    }
  }

  // ── Volume hebdo (4 dernières vs 4 précédentes) ──
  const now = Date.now()
  const ms4w = 28 * 86400000
  const recent4w = sorted.filter(s => now - new Date(s.date).getTime() < ms4w)
  const prev4w = sorted.filter(s => {
    const age = now - new Date(s.date).getTime()
    return age >= ms4w && age < ms4w * 2
  })
  const weeklyVolume = (recent4w.reduce((a, s) => a + s.distance / 1000, 0)) / 4
  const prevVolume = (prev4w.reduce((a, s) => a + s.distance / 1000, 0)) / 4
  const volumeDelta = prevVolume > 0 ? ((weeklyVolume - prevVolume) / prevVolume) * 100 : null

  // ── Insight dynamique ──
  let insight: string
  if (sorted.length < 3) {
    insight = 'Ajoutez des séances pour générer des insights personnalisés.'
  } else {
    const last3 = sorted.slice(-3)
    const prev3 = sorted.slice(-6, -3)
    if (prev3.length >= 3) {
      const avgPaceLast = last3.reduce((a, s) => a + s.avgPace, 0) / 3
      const avgPacePrev = prev3.reduce((a, s) => a + s.avgPace, 0) / 3
      const paceChange = ((avgPacePrev - avgPaceLast) / avgPacePrev) * 100

      if (economyDelta !== null && economyDelta < -2) {
        insight = `Votre économie de course s'est améliorée de ${Math.abs(economyDelta).toFixed(1)}% — vous courez plus vite pour le même effort cardiaque.`
      } else if (paceChange > 2) {
        insight = `Allure moyenne en progression de ${paceChange.toFixed(1)}% sur vos 3 dernières sorties vs les 3 précédentes.`
      } else if (paceChange < -2) {
        insight = `Allure en léger recul (${Math.abs(paceChange).toFixed(1)}%) — pensez à intégrer plus de récupération.`
      } else if (volumeDelta !== null && volumeDelta > 15) {
        insight = `Volume en hausse de ${volumeDelta.toFixed(0)}% — bonne montée en charge, attention à la surcharge.`
      } else {
        insight = `Performances stables sur vos dernières séances. Allure moyenne : ${formatPaceSec(avgPaceLast)}/km.`
      }
    } else {
      const avgPace = last3.reduce((a, s) => a + s.avgPace, 0) / 3
      insight = `Allure moyenne récente : ${formatPaceSec(avgPace)}/km sur ${sorted.length} séances enregistrées.`
    }
  }

  return {
    lactateThresholdPace,
    lactateDelta,
    marathonPrediction,
    marathonSource,
    runningEconomy,
    economyDelta,
    weeklyVolume,
    volumeDelta,
    insight,
  }
}

function AiStatsCard({ sessions, profile }: {
  sessions: SessionInput[]
  profile: { basePaceSecPerKm: number; heartRateModel: { restingHR: number; maxHR: number }; enduranceScore: number }
}) {
  const stats = useMemo(() => computeAiStats(sessions, profile), [sessions, profile])

  const DeltaBadge = ({ value, unit, inverted = false }: { value: number | null; unit?: string; inverted?: boolean }) => {
    if (value === null) return null
    // inverted: pour l'allure, négatif = bon ; pour le volume, positif = bon
    const isGood = inverted ? value < 0 : value > 0
    const color = isGood ? '#22c55e' : value === 0 ? 'rgba(218,226,253,0.4)' : '#f59e0b'
    const arrow = isGood ? 'M4 6V2M2 4l2-2 2 2' : 'M4 2V6M2 4l2 2 2-2'
    const label = `${value > 0 ? '+' : ''}${Math.abs(value) < 1 ? value.toFixed(1) : Math.round(value)}${unit ?? ''}`
    return (
      <p className="text-[9px] mt-1 flex items-center gap-1" style={{ color }}>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d={arrow} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {label}
      </p>
    )
  }

  return (
    <div className="flex flex-col p-6 rounded-2xl h-full"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-5">
        <div className="w-2 h-2 rounded-full bg-[#ff6d00]" />
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-white">
          Statistiques avancées
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Seuil lactique */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Seuil Lactique
          </p>
          <p className="text-[22px] font-black text-white leading-none">
            {formatPaceSec(stats.lactateThresholdPace)}
            <span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-1">/KM</span>
          </p>
          <DeltaBadge value={stats.lactateDelta} unit="s" inverted />
        </div>

        {/* Prédiction marathon */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Marathon prédit
          </p>
          {stats.marathonPrediction ? (
            <>
              <p className="text-[22px] font-black text-white leading-none">
                {formatDuration(stats.marathonPrediction)}
              </p>
              <p className="text-[9px] text-[#3b82f6] mt-1 flex items-center gap-1">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <circle cx="4" cy="4" r="3" stroke="currentColor" strokeWidth="1" />
                  <path d="M4 2.5V4l1 1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
                Riegel depuis {stats.marathonSource}
              </p>
            </>
          ) : (
            <>
              <p className="text-[16px] font-black text-[rgba(218,226,253,0.2)] leading-none">—</p>
              <p className="text-[9px] text-[rgba(218,226,253,0.3)] mt-1">Besoin d'un effort 5K+</p>
            </>
          )}
        </div>

        {/* Économie de course */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Économie de course
          </p>
          {stats.runningEconomy !== null ? (
            <>
              <p className="text-[22px] font-black text-white leading-none">
                {(stats.runningEconomy * 100).toFixed(0)}
                <span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-0.5">idx</span>
              </p>
              <DeltaBadge value={stats.economyDelta} unit="%" inverted />
            </>
          ) : (
            <>
              <p className="text-[16px] font-black text-[rgba(218,226,253,0.2)] leading-none">—</p>
              <p className="text-[9px] text-[rgba(218,226,253,0.3)] mt-1">Données FC nécessaires</p>
            </>
          )}
        </div>

        {/* Volume hebdomadaire */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)] mb-2">
            Volume / Semaine
          </p>
          <p className="text-[22px] font-black text-white leading-none">
            {stats.weeklyVolume.toFixed(0)}
            <span className="text-[11px] font-medium text-[rgba(218,226,253,0.5)] ml-1">KM</span>
          </p>
          <DeltaBadge value={stats.volumeDelta} unit="%" />
        </div>
      </div>

      {/* Insight */}
      <div className="mt-auto p-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-[10px] italic text-[rgba(218,226,253,0.4)] leading-relaxed">
          "{stats.insight}"
        </p>
      </div>
    </div>
  )
}

function PersonalBestsCard({ sessions }: { sessions: Array<{ distance: number; duration: number; date: Date; name: string }> }) {
  const distances: Array<{ label: string; min: number; max: number; unit: string }> = [
    { label: '5 Kilomètre',  min: 4500,  max: 5500,  unit: 'MIN' },
    { label: '10 Kilomètre', min: 9500,  max: 10500, unit: 'MIN' },
    { label: 'Marathon',     min: 40000, max: 44000, unit: 'HRS' },
  ]

  const bests = distances.map(({ label, min, max, unit }) => {
    const matching = sessions.filter(s => s.distance >= min && s.distance <= max)
    const best = matching.sort((a, b) => a.duration - b.duration)[0]
    return { label, unit, best }
  })

  return (
    <div className="flex flex-col p-6 rounded-2xl h-full"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-6">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.5 4H13l-3.5 2.5 1.5 4L7 9 3 11.5l1.5-4L1 5h4.5L7 1z"
            fill="#f59e0b" stroke="#f59e0b" strokeWidth="0.5"/>
        </svg>
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-white">
          Personal Bests
        </span>
      </div>

      <div className="flex flex-col gap-5 flex-1 justify-between">
        {bests.map(({ label, unit, best }) => (
          <div key={label} className="flex items-end justify-between border-b border-white/5 pb-4 last:border-0 last:pb-0">
            <div>
              <p className="text-[13px] font-semibold text-white mb-1">{label}</p>
              {best ? (
                <p className="text-[9px] tracking-[0.5px] uppercase text-[rgba(218,226,253,0.35)]">
                  {new Date(best.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                  {' • '}{best.name.slice(0, 20)}
                </p>
              ) : (
                <p className="text-[9px] tracking-[0.5px] uppercase text-[rgba(218,226,253,0.25)]">
                  Aucune séance
                </p>
              )}
            </div>
            {best ? (
              <p className="text-[28px] font-black text-white leading-none">
                {formatDuration(best.duration)}
                <span className="text-[10px] font-medium text-[rgba(218,226,253,0.4)] ml-1">{unit}</span>
              </p>
            ) : (
              <p className="text-[18px] font-black text-[rgba(218,226,253,0.2)]">—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ConnectionBadge({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
      style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}>
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#22c55e]' : 'bg-[rgba(218,226,253,0.2)]'}`} />
      <div>
        <p className="text-[9px] tracking-[1px] uppercase text-[rgba(218,226,253,0.4)]">{label}</p>
        <p className={`text-[10px] font-bold tracking-[0.5px] uppercase ${connected ? 'text-[#22c55e]' : 'text-[rgba(218,226,253,0.3)]'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function ProfilPage() {
  const { profile, sessions } = useAppStore()
  const { athlete, token } = useStravaStore()

  const stravaConnected = !!(athlete && token)
  const garminConnected = sessions.some(s => s.id.startsWith('garmin-'))

  const currentYear = new Date().getFullYear()
  const yearSessions = sessions.filter(s => new Date(s.date).getFullYear() === currentYear)
  const totalKmYear = yearSessions.reduce((acc, s) => acc + s.distance / 1000, 0)
  const totalElevYear = yearSessions.reduce((acc, s) => acc + s.elevationGain, 0)

  const runnerName = athlete
    ? `${athlete.firstname} ${athlete.lastname ?? ''}`.trim().toUpperCase()
    : (profile.name || 'Trail Runner').toUpperCase()
  const location = athlete?.city ? `${athlete.city}, ${athlete.country ?? ''}`.replace(/, $/, '') : null

  // VO2max et niveau calculés depuis les performances réelles (VDOT Jack Daniels)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vo2Data = useMemo(() => computeVO2Data(sessions), [sessions])
  const level = vo2Data.level


  return (
    <div className="w-full flex flex-col gap-5 pb-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        {/* Left: avatar + name */}
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <div className="w-[90px] h-[90px] rounded-2xl overflow-hidden"
              style={{ background: '#111827', border: '2px solid rgba(255,109,0,0.3)' }}>
              {athlete?.profile ? (
                <img src={athlete.profile} alt={runnerName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl">🏃</div>
              )}
            </div>
            {/* Status dot */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0b1326] bg-[#22c55e]" />
          </div>

          <div>
            <h1 className="text-[32px] sm:text-[40px] font-black text-white leading-none tracking-tight mb-2">
              {runnerName}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-[1px] uppercase"
                style={{ background: '#ff6d00', color: '#1a0500' }}>
                {level}
              </span>
              {location && (
                <span className="flex items-center gap-1 text-[11px] text-[rgba(218,226,253,0.5)]">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                    <path d="M5 1C3.07 1 1.5 2.57 1.5 4.5c0 2.75 3.5 6.5 3.5 6.5s3.5-3.75 3.5-6.5C8.5 2.57 6.93 1 5 1z"
                      stroke="currentColor" strokeWidth="1.2" fill="none"/>
                    <circle cx="5" cy="4.5" r="1" fill="currentColor"/>
                  </svg>
                  {location}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: connections */}
        <div className="flex items-center gap-3 shrink-0">
          <ConnectionBadge label="Strava"  connected={stravaConnected} />
          <ConnectionBadge label="Garmin"  connected={garminConnected} />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Kilomètre Année"
          value={formatNumber(totalKmYear)}
          unit="KM"
          accent="#ff6d00"
          progress={Math.min(100, (totalKmYear / 3000) * 100)}
        />
        <StatCard
          label="Total Dénivelé Année"
          value={formatNumber(totalElevYear)}
          unit="M"
          accent="#3b82f6"
          progress={Math.min(100, (totalElevYear / 50000) * 100)}
        />
        <Vo2Card data={vo2Data} />
      </div>

      {/* ── AI Stats + Personal Bests ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AiStatsCard sessions={sessions} profile={profile} />
        <PersonalBestsCard sessions={sessions} />
      </div>

      {/* ── Analyse détaillée (scores, charts, zones FC, terrain) ── */}
      {sessions.length > 0 && <RunnerAnalysisPanel />}

    </div>
  )
}