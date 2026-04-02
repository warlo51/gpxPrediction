/**
 * Service d'analyse poussée du profil coureur
 * Génère des insights, tendances et métriques avancées depuis l'historique.
 */

import type { TrainingSession, RunnerProfile } from '@/types'

// ─── Types d'analyse ──────────────────────────────────────────────────────────

export type PerformanceTrend = {
  date: Date
  paceSecPerKm: number
  distanceKm: number
  elevationGain: number
  avgHR?: number
  effortScore: number // 0-100, combinaison distance + D+ + FC
}

export type GradePacePoint = {
  grade: number       // tranche de pente (ex: -10, -5, 0, 5, 10…)
  paceSecPerKm: number
  speedKmh: number
  sampleCount: number
}

export type WeeklyLoad = {
  week: string        // "Sem. 1", "Sem. 2"…
  distanceKm: number
  elevationGain: number
  sessionCount: number
  avgPace: number
  /** Charge d'entraînement cumulée (Training Load / EPOC Garmin), 0 si non disponible */
  trainingLoad: number
}

export type StrengthWeakness = {
  type: 'force' | 'faiblesse' | 'neutre'
  label: string
  detail: string
  icon: string
  value?: string
}

export type RunnerAnalysis = {
  // Tendance de performance sur les 30 dernières séances
  performanceTrend: PerformanceTrend[]
  // Courbe vitesse par tranche de pente (depuis les streams)
  gradePaceCurve: GradePacePoint[]
  // Charge hebdomadaire sur les 12 dernières semaines
  weeklyLoad: WeeklyLoad[]
  // Forces et faiblesses détectées
  strengths: StrengthWeakness[]
  // Statistiques globales
  stats: {
    totalDistanceKm: number
    totalElevationGain: number
    totalDurationHours: number
    totalSessions: number
    longestRunKm: number
    biggestElevGain: number
    avgDistanceKm: number
    avgElevPerKm: number
    consistencyScore: number   // 0-100 : régularité des sorties
    progressionScore: number   // 0-100 : amélioration de l'allure sur la période
    trailScore: number         // 0-100 : spécificité trail (D+/km)
    enduranceScore: number     // 0-100 : résistance à la fatigue (calculé depuis les sessions)
  }
  // Zones FC classiques (% FC max)
  trainingZones: {
    zone: number
    label: string
    color: string
    minHR: number
    maxHR: number
    pct: number // % du temps estimé dans cette zone
  }[]
  // Zones FC de réserve — méthode Karvonen (% FCR)
  karvonenZones: {
    zone: number
    label: string
    color: string
    minHR: number   // bpm absolu = FCR * pct + FC repos
    maxHR: number
    minPct: number  // % FCR min
    maxPct: number  // % FCR max
    pct: number     // % du temps estimé dans cette zone
  }[]
  // Bilan par type de terrain
  terrainBreakdown: {
    flat: number    // % de km sur plat
    uphill: number  // % de km en montée
    downhill: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

function getWeekKey(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay() + 1) // Lundi
  return d.toISOString().slice(0, 10)
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/**
 * Déduplique les sessions cross-sources (Strava + FIT).
 * Deux sessions sont considérées comme identiques si :
 * - elles sont à moins de 5 minutes d'écart
 * - leur distance est similaire à ±15%
 * En cas de doublon, on garde celle avec le plus de données (streams).
 */
function deduplicateSessions(sessions: TrainingSession[]): TrainingSession[] {
  // Trier par date pour un parcours stable
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )
  const kept: TrainingSession[] = []

  for (const s of sorted) {
    const dupeIdx = kept.findIndex(existing => {
      const timeDiff = Math.abs(
        new Date(existing.date).getTime() - new Date(s.date).getTime(),
      )
      if (timeDiff > 5 * 60 * 1000) return false // > 5 min d'écart
      if (existing.distance === 0 || s.distance === 0) return false
      const ratio = Math.min(existing.distance, s.distance) /
        Math.max(existing.distance, s.distance)
      return ratio > 0.85 // ±15% de distance
    })

    if (dupeIdx >= 0) {
      // Garder la session avec le plus de données
      const existing = kept[dupeIdx]!
      const existingScore = (existing.streams?.heartrate ? 1 : 0) +
        (existing.streams?.velocity_smooth ? 1 : 0) +
        (existing.streams?.latlng ? 1 : 0)
      const newScore = (s.streams?.heartrate ? 1 : 0) +
        (s.streams?.velocity_smooth ? 1 : 0) +
        (s.streams?.latlng ? 1 : 0)
      if (newScore > existingScore) {
        kept[dupeIdx] = s
      }
    } else {
      kept.push(s)
    }
  }

  return kept
}

// ─── Tendance de performance ──────────────────────────────────────────────────

function computePerformanceTrend(sessions: TrainingSession[]): PerformanceTrend[] {
  return sessions
    .filter(s => s.avgPace > 0 && s.distance > 0)
    .slice(-40)
    .map(s => {
      // Effort score : priorité Training Load Garmin (EPOC), fallback calcul custom
      let effortScore: number
      if (s.trainingLoad && s.trainingLoad > 0) {
        // Training Load Garmin (EPOC) : typiquement 0-300+, normaliser sur 0-100
        effortScore = Math.min(100, Math.round(s.trainingLoad / 3))
      } else {
        const distKm = s.distance / 1000
        const elevScore = Math.min(50, (s.elevationGain / distKm) / 2)
        const distScore = Math.min(30, distKm / 2)
        const hrScore = s.avgHeartRate
          ? Math.min(20, Math.max(0, (180 - s.avgHeartRate) / 2))
          : 10
        effortScore = Math.round(elevScore + distScore + hrScore)
      }
      return {
        date: new Date(s.date),
        paceSecPerKm: s.avgPace,
        distanceKm: s.distance / 1000,
        elevationGain: s.elevationGain,
        avgHR: s.avgHeartRate,
        effortScore,
      }
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

// ─── Courbe vitesse/pente depuis les streams ──────────────────────────────────

function computeGradePaceCurve(sessions: TrainingSession[]): GradePacePoint[] {
  const GRADE_BUCKETS = [-20, -15, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 15, 20, 25, 30]
  const bucketData = new Map<number, number[]>()
  GRADE_BUCKETS.forEach(g => bucketData.set(g, []))

  for (const session of sessions) {
    const { distance: distStream, altitude: altStream, velocity_smooth, grade_smooth } =
      session.streams ?? {}
    if (!distStream || !altStream) continue

    const windowSize = 10
    for (let i = windowSize; i < distStream.length; i++) {
      const dDist = distStream[i]! - distStream[i - windowSize]!
      if (dDist < 2) continue

      // Utiliser grade_smooth si dispo, sinon calculer
      let grade: number
      if (grade_smooth?.[i] !== undefined) {
        grade = grade_smooth[i]!
      } else {
        const dAlt = altStream[i]! - altStream[i - windowSize]!
        grade = (dAlt / dDist) * 100
      }

      const speedMs = velocity_smooth?.[i] ?? (dDist / windowSize)
      if (speedMs < 0.3 || speedMs > 9 || Math.abs(grade) > 50) continue

      // Trouver le bucket le plus proche
      let closest = GRADE_BUCKETS[0]!
      let minDiff = Math.abs(grade - closest)
      for (const b of GRADE_BUCKETS) {
        const diff = Math.abs(grade - b)
        if (diff < minDiff) { minDiff = diff; closest = b }
      }
      if (minDiff <= 3) {
        bucketData.get(closest)!.push(speedMs)
      }
    }
  }

  return GRADE_BUCKETS
    .map(grade => {
      const speeds = bucketData.get(grade)!
      if (speeds.length < 5) return null
      const medSpeed = median(speeds)
      return {
        grade,
        speedKmh: parseFloat((medSpeed * 3.6).toFixed(2)),
        paceSecPerKm: Math.round(1000 / medSpeed),
        sampleCount: speeds.length,
      }
    })
    .filter((p): p is GradePacePoint => p !== null)
}

// ─── Charge hebdomadaire ──────────────────────────────────────────────────────

function computeWeeklyLoad(sessions: TrainingSession[]): WeeklyLoad[] {
  const map = new Map<string, { distanceKm: number; elevationGain: number; paces: number[]; count: number; trainingLoad: number }>()

  // 12 dernières semaines
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 84)

  for (const s of sessions) {
    if (new Date(s.date) < cutoff) continue
    const key = getWeekKey(new Date(s.date))
    const existing = map.get(key) ?? { distanceKm: 0, elevationGain: 0, paces: [], count: 0, trainingLoad: 0 }
    existing.distanceKm += s.distance / 1000
    existing.elevationGain += s.elevationGain
    if (s.avgPace > 0) existing.paces.push(s.avgPace)
    existing.trainingLoad += s.trainingLoad ?? 0
    existing.count++
    map.set(key, existing)
  }

  // Générer les 12 semaines (même vides)
  const weeks: WeeklyLoad[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i * 7)
    const key = getWeekKey(d)
    const data = map.get(key)
    weeks.push({
      week: formatWeekLabel(key),
      distanceKm: parseFloat((data?.distanceKm ?? 0).toFixed(1)),
      elevationGain: Math.round(data?.elevationGain ?? 0),
      sessionCount: data?.count ?? 0,
      avgPace: data?.paces.length ? Math.round(mean(data.paces)) : 0,
      trainingLoad: Math.round(data?.trainingLoad ?? 0),
    })
  }
  return weeks
}

// ─── Forces / Faiblesses ──────────────────────────────────────────────────────

function computeStrengthsWeaknesses(
  sessions: TrainingSession[],
  stats: RunnerAnalysis['stats'],
): StrengthWeakness[] {
  const result: StrengthWeakness[] = []
  if (sessions.length === 0) return result

  const sessionsWithHR = sessions.filter(s => s.avgHeartRate)

  // Régularité (réutilise le score unifié de computeStats basé sur les semaines uniques)
  const cutoff12w = new Date(); cutoff12w.setDate(cutoff12w.getDate() - 84)
  const recentWeeks = new Set(
    sessions.filter(s => new Date(s.date) >= cutoff12w).map(s => getWeekKey(new Date(s.date)))
  )
  if (stats.consistencyScore >= 70) {
    result.push({ type: 'force', icon: '📅', label: 'Régularité', detail: `${recentWeeks.size} semaines actives sur 12`, value: `${stats.consistencyScore}%` })
  } else if (stats.consistencyScore < 40) {
    result.push({ type: 'faiblesse', icon: '📅', label: 'Régularité', detail: `Seulement ${recentWeeks.size} semaines actives sur 12`, value: `${stats.consistencyScore}%` })
  }

  // Endurance (distance moyenne)
  if (stats.avgDistanceKm >= 15) {
    result.push({ type: 'force', icon: '🏅', label: 'Endurance de base', detail: `Distance moyenne ${stats.avgDistanceKm} km`, value: `${stats.avgDistanceKm} km` })
  } else if (stats.avgDistanceKm < 8) {
    result.push({ type: 'faiblesse', icon: '📏', label: 'Volume kilométrique', detail: 'Distance moyenne faible pour le trail', value: `${stats.avgDistanceKm} km` })
  }

  // Spécificité trail (D+/km)
  if (stats.avgElevPerKm >= 60) {
    result.push({ type: 'force', icon: '⛰️', label: 'Spécificité trail', detail: `${stats.avgElevPerKm.toFixed(0)} m D+/km en moyenne`, value: `${stats.avgElevPerKm.toFixed(0)} m/km` })
  } else if (stats.avgElevPerKm < 20) {
    result.push({ type: 'faiblesse', icon: '🏔️', label: 'Manque de dénivelé', detail: 'Peu de D+ dans les séances — intégrer plus de montées', value: `${stats.avgElevPerKm.toFixed(0)} m/km` })
  } else {
    result.push({ type: 'neutre', icon: '📈', label: 'Terrain varié', detail: `${stats.avgElevPerKm.toFixed(0)} m D+/km — profil trail moyen`, value: `${stats.avgElevPerKm.toFixed(0)} m/km` })
  }

  // Progression (réutilise le score unifié — converti en % d'amélioration)
  const progressionPct = stats.progressionScore - 50 // >0 = amélioration, <0 = régression
  if (progressionPct >= 15) {
    result.push({ type: 'force', icon: '📈', label: 'Progression', detail: `Allure en amélioration récente`, value: `${stats.progressionScore}/100` })
  } else if (progressionPct <= -15) {
    result.push({ type: 'faiblesse', icon: '📉', label: 'Régression', detail: 'Allure en baisse — vérifier la récupération', value: `${stats.progressionScore}/100` })
  }

  // Endurance score (calculé depuis les sessions)
  if (stats.enduranceScore >= 75) {
    result.push({ type: 'force', icon: '🔋', label: 'Résistance à la fatigue', detail: 'Bonne stabilité de l\'allure sur la durée', value: `${stats.enduranceScore}%` })
  } else if (stats.enduranceScore < 50) {
    result.push({ type: 'faiblesse', icon: '😓', label: 'Fatigue progressive', detail: 'L\'allure se dégrade en fin de sortie', value: `${stats.enduranceScore}%` })
  }

  // FC disponible
  if (sessionsWithHR.length === 0) {
    result.push({ type: 'neutre', icon: '❤️', label: 'FC non disponible', detail: 'Ajouter une ceinture cardiaque pour affiner les zones', value: undefined })
  } else {
    const avgHRAll = mean(sessionsWithHR.map(s => s.avgHeartRate!))
    result.push({ type: 'neutre', icon: '❤️', label: 'FC moyenne historique', detail: `${Math.round(avgHRAll)} bpm en moyenne sur ${sessionsWithHR.length} séances`, value: `${Math.round(avgHRAll)} bpm` })
  }

  return result
}

// ─── Zones d'entraînement ─────────────────────────────────────────────────────

function computeTrainingZones(
  sessions: TrainingSession[],
  profile: RunnerProfile,
): RunnerAnalysis['trainingZones'] {
  const { maxHR } = profile.heartRateModel

  // Méthode % FC max : FC cible = FC max × % intensité
  const zones = [
    { zone: 1, label: 'Récupération', color: '#22c55e', pctMin: 0.50, pctMax: 0.60 },
    { zone: 2, label: 'Aérobie de base', color: '#84cc16', pctMin: 0.60, pctMax: 0.70 },
    { zone: 3, label: 'Aérobie seuil', color: '#f59e0b', pctMin: 0.70, pctMax: 0.80 },
    { zone: 4, label: 'Seuil anaérobie', color: '#f97316', pctMin: 0.80, pctMax: 0.90 },
    { zone: 5, label: 'Maximal', color: '#ef4444', pctMin: 0.90, pctMax: 1.00 },
  ]

  // Estimer le % de temps dans chaque zone
  // Priorité : 1) hrZones Garmin (natif montre), 2) streams HR, 3) FC moyenne pondérée
  const zoneCounts = new Array(zones.length).fill(0)
  let totalPoints = 0

  for (const s of sessions) {
    if (s.hrZones) {
      // Données Garmin natives : temps en secondes par zone
      for (let j = 0; j < zones.length; j++) {
        zoneCounts[j] += s.hrZones[j] ?? 0
      }
      totalPoints += s.hrZones.reduce((a, b) => a + b, 0)
    } else if (s.streams?.heartrate?.length) {
      // Données point par point → répartition précise
      for (const hr of s.streams.heartrate) {
        const pct = hr / maxHR
        let idx = -1
        for (let j = zones.length - 1; j >= 0; j--) {
          if (pct >= zones[j]!.pctMin) { idx = j; break }
        }
        if (idx >= 0) zoneCounts[idx]++
        totalPoints++
      }
    } else if (s.avgHeartRate) {
      // Fallback : FC moyenne pondérée par la durée
      const pct = s.avgHeartRate / maxHR
      let idx = -1
      for (let j = zones.length - 1; j >= 0; j--) {
        if (pct >= zones[j]!.pctMin) { idx = j; break }
      }
      if (idx >= 0) zoneCounts[idx] += s.duration
      totalPoints += s.duration
    }
  }
  const total = totalPoints || 1

  return zones.map((z, i) => ({
    zone: z.zone,
    label: z.label,
    color: z.color,
    minHR: Math.round(maxHR * z.pctMin),
    maxHR: Math.round(maxHR * z.pctMax),
    pct: Math.round((zoneCounts[i]! / total) * 100),
  }))
}

// ─── Zones FC de réserve — Karvonen ──────────────────────────────────────────

/**
 * Méthode Karvonen : FC cible = FC repos + (FC réserve × % intensité)
 * FC réserve = FC max - FC repos
 * Plus précise que le % FC max car tient compte de la FC de repos.
 */
function computeKarvonenZones(
  sessions: TrainingSession[],
  profile: RunnerProfile,
): RunnerAnalysis['karvonenZones'] {
  const { restingHR, maxHR } = profile.heartRateModel
  const fcReserve = maxHR - restingHR

  const zones = [
    { zone: 1, label: 'Récupération active', color: '#22c55e', pctMin: 0.50, pctMax: 0.60 },
    { zone: 2, label: 'Endurance fondamentale', color: '#84cc16', pctMin: 0.60, pctMax: 0.70 },
    { zone: 3, label: 'Aérobie seuil', color: '#f59e0b', pctMin: 0.70, pctMax: 0.80 },
    { zone: 4, label: 'Seuil anaérobie', color: '#f97316', pctMin: 0.80, pctMax: 0.90 },
    { zone: 5, label: 'Maximal / PMA', color: '#ef4444', pctMin: 0.90, pctMax: 1.00 },
  ]

  // FC absolue = FC repos + FCR × pct
  const toAbsHR = (pct: number) => Math.round(restingHR + fcReserve * pct)

  // Estimer le % de temps dans chaque zone
  // Priorité : 1) hrZones Garmin (natif montre), 2) streams HR, 3) FC moyenne pondérée
  const zoneCounts = new Array(zones.length).fill(0)
  let totalPoints = 0

  for (const s of sessions) {
    if (s.hrZones) {
      // Données Garmin natives : temps en secondes par zone
      for (let j = 0; j < zones.length; j++) {
        zoneCounts[j] += s.hrZones[j] ?? 0
      }
      totalPoints += s.hrZones.reduce((a, b) => a + b, 0)
    } else if (s.streams?.heartrate?.length) {
      for (const hr of s.streams.heartrate) {
        const pct = fcReserve > 0 ? (hr - restingHR) / fcReserve : 0
        let idx = -1
        for (let j = zones.length - 1; j >= 0; j--) {
          if (pct >= zones[j]!.pctMin) { idx = j; break }
        }
        if (idx >= 0) zoneCounts[idx]++
        totalPoints++
      }
    } else if (s.avgHeartRate) {
      const pct = fcReserve > 0 ? (s.avgHeartRate - restingHR) / fcReserve : 0
      let idx = -1
      for (let j = zones.length - 1; j >= 0; j--) {
        if (pct >= zones[j]!.pctMin) { idx = j; break }
      }
      if (idx >= 0) zoneCounts[idx] += s.duration
      totalPoints += s.duration
    }
  }
  const total = totalPoints || 1

  return zones.map((z, i) => ({
    zone: z.zone,
    label: z.label,
    color: z.color,
    minHR: toAbsHR(z.pctMin),
    maxHR: toAbsHR(z.pctMax),
    minPct: Math.round(z.pctMin * 100),
    maxPct: Math.round(z.pctMax * 100),
    pct: Math.round((zoneCounts[i]! / total) * 100),
  }))
}

// ─── Terrain breakdown ────────────────────────────────────────────────────────

function computeTerrainBreakdown(sessions: TrainingSession[]): RunnerAnalysis['terrainBreakdown'] {
  let flatDist = 0, uphillDist = 0, downhillDist = 0

  for (const s of sessions) {
    const { distance: distStream, altitude: altStream } = s.streams ?? {}
    if (!distStream || !altStream) continue
    const window = 5
    for (let i = window; i < distStream.length; i++) {
      const dDist = distStream[i]! - distStream[i - window]!
      const dAlt = altStream[i]! - altStream[i - window]!
      if (dDist < 1) continue
      const grade = (dAlt / dDist) * 100
      if (grade > 2) uphillDist += dDist
      else if (grade < -2) downhillDist += dDist
      else flatDist += dDist
    }
  }

  const total = flatDist + uphillDist + downhillDist || 1
  return {
    flat: Math.round((flatDist / total) * 100),
    uphill: Math.round((uphillDist / total) * 100),
    downhill: Math.round((downhillDist / total) * 100),
  }
}

// ─── Statistiques globales ────────────────────────────────────────────────────

function computeStats(
  sessions: TrainingSession[],
  profile: RunnerProfile,
): RunnerAnalysis['stats'] {
  if (!sessions.length) return {
    totalDistanceKm: 0, totalElevationGain: 0, totalDurationHours: 0,
    totalSessions: 0, longestRunKm: 0, biggestElevGain: 0,
    avgDistanceKm: 0, avgElevPerKm: 0, consistencyScore: 0,
    progressionScore: 50, trailScore: 0, enduranceScore: 50,
  }

  const totalDistanceKm = sessions.reduce((a, s) => a + s.distance / 1000, 0)
  const totalElevationGain = sessions.reduce((a, s) => a + s.elevationGain, 0)
  const totalDurationHours = sessions.reduce((a, s) => a + s.duration / 3600, 0)
  const longestRunKm = Math.max(...sessions.map(s => s.distance / 1000))
  const biggestElevGain = Math.max(...sessions.map(s => s.elevationGain))
  const avgDistanceKm = totalDistanceKm / sessions.length
  const avgElevPerKm = totalDistanceKm > 0 ? totalElevationGain / totalDistanceKm : 0

  // Consistance : nombre de semaines avec au moins 1 sortie sur 12
  const cutoff12w = new Date(); cutoff12w.setDate(cutoff12w.getDate() - 84)
  const recentWeeks = new Set(
    sessions.filter(s => new Date(s.date) >= cutoff12w).map(s => getWeekKey(new Date(s.date)))
  )
  const consistencyScore = Math.min(100, Math.round((recentWeeks.size / 12) * 100))

  // Progression : comparaison allure sur les 20 dernières séances
  const recentPaces = sessions
    .filter(s => s.avgPace > 0)
    .slice(-20)
    .map(s => s.avgPace)
  let progressionScore = 50
  if (recentPaces.length >= 4) {
    const half = Math.floor(recentPaces.length / 2)
    const before = mean(recentPaces.slice(0, half))
    const after = mean(recentPaces.slice(half))
    const diff = (before - after) / before // positif = amélioration (allure qui baisse)
    progressionScore = Math.round(50 + diff * 500) // ±50 pts autour de 50
    progressionScore = Math.max(0, Math.min(100, progressionScore))
  }

  // Trail score : basé sur D+/km
  const trailScore = Math.min(100, Math.round(avgElevPerKm * 1.5))

  // Endurance score : dérive de l'allure au sein des séances longues (via streams)
  const enduranceDrifts: number[] = []
  for (const s of sessions) {
    if (!s.streams?.velocity_smooth || s.duration < 1800) continue // min 30 min
    const velocities = s.streams.velocity_smooth.filter(v => v > 0.5) // exclure les arrêts
    if (velocities.length < 20) continue
    const half = Math.floor(velocities.length / 2)
    const firstHalfMean = mean(velocities.slice(0, half))
    const secondHalfMean = mean(velocities.slice(half))
    if (firstHalfMean > 0) {
      enduranceDrifts.push(Math.min(1.2, secondHalfMean / firstHalfMean))
    }
  }
  const enduranceScore = enduranceDrifts.length > 0
    ? Math.round(Math.min(100, Math.max(10, mean(enduranceDrifts) * 100)))
    : Math.round(profile.enduranceScore * 100) // fallback profil

  return {
    totalDistanceKm: parseFloat(totalDistanceKm.toFixed(1)),
    totalElevationGain: Math.round(totalElevationGain),
    totalDurationHours: parseFloat(totalDurationHours.toFixed(1)),
    totalSessions: sessions.length,
    longestRunKm: parseFloat(longestRunKm.toFixed(1)),
    biggestElevGain: Math.round(biggestElevGain),
    avgDistanceKm: parseFloat(avgDistanceKm.toFixed(1)),
    avgElevPerKm: parseFloat(avgElevPerKm.toFixed(1)),
    consistencyScore,
    progressionScore,
    trailScore,
    enduranceScore,
  }
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export function analyzeRunner(
  sessions: TrainingSession[],
  profile: RunnerProfile,
): RunnerAnalysis {
  // Filtrer les sessions invalides et dédupliquer les imports croisés (Strava + FIT)
  const valid = sessions.filter(s => s.distance > 0 && s.duration > 0)
  const deduped = deduplicateSessions(valid)
  const sorted = [...deduped].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Calculer les stats en premier pour réutiliser dans les forces/faiblesses
  const stats = computeStats(sorted, profile)

  return {
    performanceTrend: computePerformanceTrend(sorted),
    gradePaceCurve: computeGradePaceCurve(sorted),
    weeklyLoad: computeWeeklyLoad(sorted),
    strengths: computeStrengthsWeaknesses(sorted, stats),
    stats,
    trainingZones: computeTrainingZones(sorted, profile),
    karvonenZones: computeKarvonenZones(sorted, profile),
    terrainBreakdown: computeTerrainBreakdown(sorted),
  }
}
