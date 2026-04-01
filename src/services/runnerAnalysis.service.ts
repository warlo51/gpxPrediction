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

// ─── Tendance de performance ──────────────────────────────────────────────────

function computePerformanceTrend(sessions: TrainingSession[]): PerformanceTrend[] {
  return sessions
    .filter(s => s.avgPace > 0 && s.distance > 0)
    .slice(-40)
    .map(s => {
      const distKm = s.distance / 1000
      const elevScore = Math.min(50, (s.elevationGain / distKm) / 2) // max 50 pts
      const distScore = Math.min(30, distKm / 2)                      // max 30 pts
      const hrScore = s.avgHeartRate
        ? Math.min(20, Math.max(0, (180 - s.avgHeartRate) / 2))        // FC basse = effort moindre
        : 10
      return {
        date: new Date(s.date),
        paceSecPerKm: s.avgPace,
        distanceKm: distKm,
        elevationGain: s.elevationGain,
        avgHR: s.avgHeartRate,
        effortScore: Math.round(elevScore + distScore + hrScore),
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
  const map = new Map<string, { distanceKm: number; elevationGain: number; paces: number[]; count: number }>()

  // 12 dernières semaines
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 84)

  for (const s of sessions) {
    if (new Date(s.date) < cutoff) continue
    const key = getWeekKey(new Date(s.date))
    const existing = map.get(key) ?? { distanceKm: 0, elevationGain: 0, paces: [], count: 0 }
    existing.distanceKm += s.distance / 1000
    existing.elevationGain += s.elevationGain
    if (s.avgPace > 0) existing.paces.push(s.avgPace)
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
    })
  }
  return weeks
}

// ─── Forces / Faiblesses ──────────────────────────────────────────────────────

function computeStrengthsWeaknesses(
  sessions: TrainingSession[],
  profile: RunnerProfile,
): StrengthWeakness[] {
  const result: StrengthWeakness[] = []
  if (sessions.length === 0) return result

  const distancesKm = sessions.map(s => s.distance / 1000)
  const avgDist = mean(distancesKm)
  const elevPerKm = sessions.map(s => s.elevationGain / (s.distance / 1000))
  const avgElev = mean(elevPerKm)
  const sessionsWithHR = sessions.filter(s => s.avgHeartRate)

  // Régularité
  const cutoff12w = new Date(); cutoff12w.setDate(cutoff12w.getDate() - 84)
  const recentCount = sessions.filter(s => new Date(s.date) >= cutoff12w).length
  const consistencyScore = Math.min(100, (recentCount / 12) * 100) // 1 séance/semaine = 100%

  if (consistencyScore >= 70) {
    result.push({ type: 'force', icon: '📅', label: 'Régularité', detail: `${recentCount} séances sur 12 semaines`, value: `${Math.round(consistencyScore)}%` })
  } else if (consistencyScore < 40) {
    result.push({ type: 'faiblesse', icon: '📅', label: 'Régularité', detail: 'Moins d\'1 sortie/semaine en moyenne', value: `${Math.round(consistencyScore)}%` })
  }

  // Endurance
  if (avgDist >= 15) {
    result.push({ type: 'force', icon: '🏅', label: 'Endurance de base', detail: `Distance moyenne ${avgDist.toFixed(1)} km`, value: `${avgDist.toFixed(1)} km` })
  } else if (avgDist < 8) {
    result.push({ type: 'faiblesse', icon: '📏', label: 'Volume kilométrique', detail: 'Distance moyenne faible pour le trail', value: `${avgDist.toFixed(1)} km` })
  }

  // Spécificité trail (D+/km)
  if (avgElev >= 60) {
    result.push({ type: 'force', icon: '⛰️', label: 'Spécificité trail', detail: `${avgElev.toFixed(0)} m D+/km en moyenne`, value: `${avgElev.toFixed(0)} m/km` })
  } else if (avgElev < 20) {
    result.push({ type: 'faiblesse', icon: '🏔️', label: 'Manque de dénivelé', detail: 'Peu de D+ dans les séances — intégrer plus de montées', value: `${avgElev.toFixed(0)} m/km` })
  } else {
    result.push({ type: 'neutre', icon: '📈', label: 'Terrain varié', detail: `${avgElev.toFixed(0)} m D+/km — profil trail moyen`, value: `${avgElev.toFixed(0)} m/km` })
  }

  // Progression de l'allure (pente tendancielle sur les 20 dernières séances)
  const recentPaces = sessions
    .filter(s => s.avgPace > 0)
    .slice(-20)
    .map(s => s.avgPace)
  if (recentPaces.length >= 6) {
    const firstHalf = mean(recentPaces.slice(0, Math.floor(recentPaces.length / 2)))
    const secondHalf = mean(recentPaces.slice(Math.floor(recentPaces.length / 2)))
    const improvement = ((firstHalf - secondHalf) / firstHalf) * 100
    if (improvement >= 3) {
      result.push({ type: 'force', icon: '📈', label: 'Progression', detail: `Allure améliorée de ${improvement.toFixed(1)}% récemment`, value: `+${improvement.toFixed(1)}%` })
    } else if (improvement <= -3) {
      result.push({ type: 'faiblesse', icon: '📉', label: 'Régression', detail: `Allure dégradée de ${Math.abs(improvement).toFixed(1)}% — vérifier la récupération`, value: `${improvement.toFixed(1)}%` })
    }
  }

  // Endurance score
  if (profile.enduranceScore >= 0.75) {
    result.push({ type: 'force', icon: '🔋', label: 'Résistance à la fatigue', detail: 'Bonne stabilité de l\'allure sur la durée', value: `${Math.round(profile.enduranceScore * 100)}%` })
  } else if (profile.enduranceScore < 0.5) {
    result.push({ type: 'faiblesse', icon: '😓', label: 'Fatigue progressive', detail: 'L\'allure se dégrade en fin de sortie', value: `${Math.round(profile.enduranceScore * 100)}%` })
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

  // Estimer le % de temps dans chaque zone depuis les FC moyennes
  const sessionsWithHR = sessions.filter(s => s.avgHeartRate)
  const zoneCounts = new Array(5).fill(0)
  for (const s of sessionsWithHR) {
    const hrPct = s.avgHeartRate! / maxHR
    const zoneIdx = zones.findIndex(z => hrPct >= z.pctMin && hrPct < z.pctMax)
    if (zoneIdx >= 0) zoneCounts[zoneIdx]++
  }
  const total = sessionsWithHR.length || 1

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

  // Estimer le % de temps dans chaque zone depuis les FC moyennes des séances
  const sessionsWithHR = sessions.filter(s => s.avgHeartRate)
  const zoneCounts = new Array(zones.length).fill(0)
  for (const s of sessionsWithHR) {
    const hrPct = (s.avgHeartRate! - restingHR) / fcReserve
    const idx = zones.findIndex(z => hrPct >= z.pctMin && hrPct < z.pctMax)
    if (idx >= 0) zoneCounts[idx]++
  }
  const total = sessionsWithHR.length || 1

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

function computeStats(sessions: TrainingSession[]): RunnerAnalysis['stats'] {
  if (!sessions.length) return {
    totalDistanceKm: 0, totalElevationGain: 0, totalDurationHours: 0,
    totalSessions: 0, longestRunKm: 0, biggestElevGain: 0,
    avgDistanceKm: 0, avgElevPerKm: 0, consistencyScore: 0,
    progressionScore: 50, trailScore: 0,
  }

  const totalDistanceKm = sessions.reduce((a, s) => a + s.distance / 1000, 0)
  const totalElevationGain = sessions.reduce((a, s) => a + s.elevationGain, 0)
  const totalDurationHours = sessions.reduce((a, s) => a + s.duration / 3600, 0)
  const longestRunKm = Math.max(...sessions.map(s => s.distance / 1000))
  const biggestElevGain = Math.max(...sessions.map(s => s.elevationGain))
  const avgDistanceKm = totalDistanceKm / sessions.length
  const avgElevPerKm = totalElevationGain / totalDistanceKm

  // Consistance : nombre de semaines avec au moins 1 sortie sur 12
  const cutoff12w = new Date(); cutoff12w.setDate(cutoff12w.getDate() - 84)
  const recentWeeks = new Set(
    sessions.filter(s => new Date(s.date) >= cutoff12w).map(s => getWeekKey(new Date(s.date)))
  )
  const consistencyScore = Math.min(100, Math.round((recentWeeks.size / 12) * 100))

  // Progression : comparaison allure début vs fin historique
  const sortedByDate = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const paces = sortedByDate.filter(s => s.avgPace > 0).map(s => s.avgPace)
  let progressionScore = 50
  if (paces.length >= 4) {
    const half = Math.floor(paces.length / 2)
    const before = mean(paces.slice(0, half))
    const after = mean(paces.slice(half))
    const diff = (before - after) / before // positif = amélioration (allure qui baisse)
    progressionScore = Math.round(50 + diff * 500) // ±50 pts autour de 50
    progressionScore = Math.max(0, Math.min(100, progressionScore))
  }

  // Trail score : basé sur D+/km
  const trailScore = Math.min(100, Math.round(avgElevPerKm * 1.5))

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
  }
}

// ─── Fonction principale ──────────────────────────────────────────────────────

export function analyzeRunner(
  sessions: TrainingSession[],
  profile: RunnerProfile,
): RunnerAnalysis {
  const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    performanceTrend: computePerformanceTrend(sorted),
    gradePaceCurve: computeGradePaceCurve(sorted),
    weeklyLoad: computeWeeklyLoad(sorted),
    strengths: computeStrengthsWeaknesses(sorted, profile),
    stats: computeStats(sorted),
    trainingZones: computeTrainingZones(sorted, profile),
    karvonenZones: computeKarvonenZones(sorted, profile),
    terrainBreakdown: computeTerrainBreakdown(sorted),
  }
}
