/**
 * Service d'analyse du seuil de marche (walking threshold grade)
 *
 * À partir des splits kilométriques d'activités trail Garmin, détermine la pente
 * à partir de laquelle le runner marche plutôt que de courir.
 *
 * Méthode :
 * 1. Pour chaque split (~1km auto-lap), calculer la pente moyenne et l'allure
 * 2. Déterminer une allure de référence "course" à partir des splits à plat
 * 3. Classifier chaque split : marché si allure > 1.6 × allure de référence
 * 4. Bucketer les splits par tranches de pente
 * 5. Trouver la pente à partir de laquelle ≥50% des splits sont marchés
 */

export type ActivitySplit = {
  distance: number | null       // mètres
  duration: number | null       // secondes
  elevationGain: number | null  // mètres
  elevationLoss: number | null  // mètres
  averageSpeed: number | null   // m/s
  averageHR: number | null      // bpm
}

export type WalkGradeAnalysisResult = {
  /** Pente (%) à partir de laquelle le runner marche (≥50% des splits marchés) */
  walkingThresholdGrade: number
  /** Allure de référence "course" (s/km) utilisée pour la classification */
  runningPaceRefSecPerKm: number
  /** Nombre total de splits analysés */
  totalSplits: number
  /** Nombre de splits classifiés comme marche */
  walkedSplits: number
  /** Détail par bucket de pente (pour debug / affichage) */
  gradeBuckets: Array<{
    minGrade: number
    maxGrade: number
    splitCount: number
    walkRatio: number
  }>
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Ratio au-dessus duquel un split est considéré comme marché vs allure de référence */
const WALK_PACE_RATIO = 1.6

/** Distance minimale d'un split valide (mètres) — élimine les micro-laps */
const MIN_SPLIT_DISTANCE_M = 400

/** Tranches de pente (%) pour le bucketing */
const GRADE_BUCKETS: Array<[number, number]> = [
  [-100, 2],
  [2, 5],
  [5, 8],
  [8, 12],
  [12, 16],
  [16, 20],
  [20, 25],
  [25, 30],
  [30, 100],
]

/** Valeur par défaut si aucune donnée exploitable */
const DEFAULT_WALK_GRADE = 25

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calcule l'allure d'un split en secondes par kilomètre.
 * Retourne null si distance/duration invalides.
 */
function computePaceSecPerKm(split: ActivitySplit): number | null {
  if (!split.distance || !split.duration || split.distance < MIN_SPLIT_DISTANCE_M) return null
  return split.duration / (split.distance / 1000)
}

/**
 * Calcule la pente nette d'un split en pourcentage.
 * grade = (elevGain - elevLoss) / distance × 100
 */
function computeGradePercent(split: ActivitySplit): number | null {
  if (!split.distance || split.distance < MIN_SPLIT_DISTANCE_M) return null
  const gain = split.elevationGain ?? 0
  const loss = split.elevationLoss ?? 0
  return ((gain - loss) / split.distance) * 100
}

/**
 * Médiane d'un tableau de nombres (copie, ne mute pas l'input).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ─── Service principal ──────────────────────────────────────────────────────

/**
 * Analyse un ensemble de splits d'activités et détermine le seuil de marche.
 *
 * @param splitsMap - Map activityId → liste de splits
 * @param fallbackFlatSpeed - Vitesse plat du profil actuel (m/s), pour fallback
 *                            si pas assez de splits plat dans les données
 * @returns Résultat de l'analyse ou null si données insuffisantes
 */
export function computeWalkingThresholdGrade(
  splitsMap: Record<string | number, ActivitySplit[]>,
  fallbackFlatSpeed?: number,
): WalkGradeAnalysisResult | null {
  // ── 1. Aplatir tous les splits en une seule liste avec grade + pace
  type EnrichedSplit = { pace: number; grade: number }
  const enriched: EnrichedSplit[] = []

  for (const splits of Object.values(splitsMap)) {
    for (const split of splits) {
      const pace = computePaceSecPerKm(split)
      const grade = computeGradePercent(split)
      if (pace !== null && grade !== null) {
        enriched.push({ pace, grade })
      }
    }
  }

  if (enriched.length < 10) {
    console.warn(`[WalkGrade] Not enough valid splits (${enriched.length}) — need ≥10`)
    return null
  }

  // ── 2. Calculer allure de référence "course" : médiane des splits à plat (|grade| < 2%)
  const flatPaces = enriched.filter((s) => Math.abs(s.grade) < 2).map((s) => s.pace)
  let runningPaceRef: number
  if (flatPaces.length >= 5) {
    runningPaceRef = median(flatPaces)
  } else if (fallbackFlatSpeed && fallbackFlatSpeed > 0) {
    runningPaceRef = 1000 / fallbackFlatSpeed
    console.warn(`[WalkGrade] Only ${flatPaces.length} flat splits — using profile fallback`)
  } else {
    // Dernier recours : médiane de tous les splits (biaisé par le dénivelé)
    runningPaceRef = median(enriched.map((s) => s.pace))
    console.warn('[WalkGrade] No flat splits & no fallback — using global median')
  }

  const walkPaceThreshold = runningPaceRef * WALK_PACE_RATIO

  // ── 3. Classifier chaque split : marché si pace > seuil
  const classified = enriched.map((s) => ({ ...s, walked: s.pace > walkPaceThreshold }))
  const walkedCount = classified.filter((s) => s.walked).length

  // ── 4. Bucketer par pente et calculer le ratio de marche par bucket
  const buckets = GRADE_BUCKETS.map(([minGrade, maxGrade]) => {
    const inBucket = classified.filter((s) => s.grade >= minGrade && s.grade < maxGrade)
    const walkedInBucket = inBucket.filter((s) => s.walked).length
    return {
      minGrade,
      maxGrade,
      splitCount: inBucket.length,
      walkRatio: inBucket.length > 0 ? walkedInBucket / inBucket.length : 0,
    }
  })

  // ── 5. Trouver le seuil : premier bucket (pente croissante) où walkRatio ≥ 0.5
  //    On skip les buckets vides et on interpole linéairement entre buckets pour plus de finesse
  let walkingThresholdGrade = DEFAULT_WALK_GRADE
  const uphillBuckets = buckets.filter((b) => b.minGrade >= 0 && b.splitCount >= 3)

  for (let i = 0; i < uphillBuckets.length; i++) {
    const bucket = uphillBuckets[i]
    if (bucket.walkRatio >= 0.5) {
      if (i === 0) {
        walkingThresholdGrade = bucket.minGrade
      } else {
        // Interpolation linéaire entre le bucket précédent (<0.5) et celui-ci (≥0.5)
        const prev = uphillBuckets[i - 1]
        const span = bucket.walkRatio - prev.walkRatio
        const t = span > 0 ? (0.5 - prev.walkRatio) / span : 0
        const prevMid = (prev.minGrade + prev.maxGrade) / 2
        const curMid = (bucket.minGrade + bucket.maxGrade) / 2
        walkingThresholdGrade = prevMid + t * (curMid - prevMid)
      }
      break
    }
  }

  // Arrondi à 1 décimale
  walkingThresholdGrade = Math.round(walkingThresholdGrade * 10) / 10

  console.log('[WalkGrade] Analysis complete:', {
    totalSplits: enriched.length,
    walkedSplits: walkedCount,
    runningPaceRef: Math.round(runningPaceRef),
    walkPaceThreshold: Math.round(walkPaceThreshold),
    walkingThresholdGrade,
  })

  return {
    walkingThresholdGrade,
    runningPaceRefSecPerKm: Math.round(runningPaceRef),
    totalSplits: enriched.length,
    walkedSplits: walkedCount,
    gradeBuckets: buckets,
  }
}
