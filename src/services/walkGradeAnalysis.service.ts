/**
 * Service d'analyse du seuil de marche (walking threshold grade)
 *
 * À partir des splits kilométriques d'activités trail Garmin, détermine la pente
 * à partir de laquelle le runner marche plutôt que de courir.
 *
 * Méthode :
 * 1. Pour chaque split (~1km auto-lap), calculer la pente montante moyenne
 *    (elevGain / distance, sans soustraire elevLoss : ce qui déclenche la marche
 *    c'est l'effort de montée, pas le net)
 * 2. Déterminer une allure de référence "course" à partir des splits à plat
 * 3. Classifier chaque split : marché si allure > WALK_PACE_RATIO × allure de référence
 * 4. Bucketer les splits par tranches de pente
 * 5. Trouver la pente à partir de laquelle ≥ WALK_RATIO_THRESHOLD des splits sont marchés
 * 6. Retourner null si le signal est insuffisant (pas de fallback arbitraire)
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

/**
 * Ratio au-dessus duquel un split est considéré comme marché vs allure de référence.
 * Calibré sur des données trail : un runner qui alterne course/marche sur 1km
 * finit ~1.35× plus lent que son allure plat. Au-dessus de 1.5× c'est clairement
 * de la marche dominante.
 */
const WALK_PACE_RATIO = 1.35

/**
 * Ratio de splits marchés au-dessus duquel on considère qu'à cette pente le
 * runner marche majoritairement.
 */
const WALK_RATIO_THRESHOLD = 0.5

/** Distance minimale d'un split valide (mètres) — élimine les micro-laps */
const MIN_SPLIT_DISTANCE_M = 400

/** Nombre minimum de splits valides pour lancer l'analyse */
const MIN_TOTAL_SPLITS = 10

/** Nombre minimum de splits dans un bucket pour qu'il soit pris en compte */
const MIN_SPLITS_PER_BUCKET = 3

/**
 * Tranches de pente (%) pour le bucketing, en utilisant le grade montant
 * (elevGain/distance). Granularité fine dans la plage 5-20% où se situe
 * la transition course↔marche pour la plupart des runners.
 */
const GRADE_BUCKETS: Array<[number, number]> = [
  [0, 2],
  [2, 4],
  [4, 6],
  [6, 8],
  [8, 10],
  [10, 12],
  [12, 15],
  [15, 18],
  [18, 22],
  [22, 100],
]

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
 * Calcule la pente montante d'un split en pourcentage.
 * On utilise elevGain/distance (et non le net) car ce qui déclenche la marche,
 * c'est l'effort de montée, pas le dénivelé net. Un split vallonné 100m+/100m-
 * aura un grade net de 0% mais le runner peut avoir marché les 100m de montée.
 *
 * grade = elevGain / distance × 100
 */
function computeGradePercent(split: ActivitySplit): number | null {
  if (!split.distance || split.distance < MIN_SPLIT_DISTANCE_M) return null
  const gain = split.elevationGain ?? 0
  return (gain / split.distance) * 100
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

  console.log(`[WalkGrade] Collected ${enriched.length} valid splits across ${Object.keys(splitsMap).length} activities`)

  if (enriched.length < MIN_TOTAL_SPLITS) {
    console.warn(`[WalkGrade] Not enough valid splits (${enriched.length}) — need ≥${MIN_TOTAL_SPLITS}`)
    return null
  }

  // ── 2. Calculer allure de référence "course"
  //     Médiane des splits à plat (grade < 2% montant). À noter qu'avec le
  //     grade montant-seul, les splits descendants et plats tombent tous
  //     dans la tranche 0-2%, ce qui donne une bonne référence.
  const flatPaces = enriched.filter((s) => s.grade < 2).map((s) => s.pace)
  let runningPaceRef: number
  let paceRefSource: string
  if (flatPaces.length >= 5) {
    runningPaceRef = median(flatPaces)
    paceRefSource = `median of ${flatPaces.length} flat splits`
  } else if (fallbackFlatSpeed && fallbackFlatSpeed > 0) {
    runningPaceRef = 1000 / fallbackFlatSpeed
    paceRefSource = `profile fallback (${flatPaces.length} flat splits insufficient)`
  } else {
    runningPaceRef = median(enriched.map((s) => s.pace))
    paceRefSource = 'global median (last resort)'
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

  // Log détaillé des buckets pour diagnostic
  console.log('[WalkGrade] Pace reference:', {
    runningPaceRef: `${Math.round(runningPaceRef)}s/km`,
    walkPaceThreshold: `${Math.round(walkPaceThreshold)}s/km`,
    source: paceRefSource,
    totalSplits: enriched.length,
    walkedSplits: walkedCount,
    walkedRatio: `${((walkedCount / enriched.length) * 100).toFixed(0)}%`,
  })
  console.table(
    buckets.map((b) => ({
      grade: `${b.minGrade}-${b.maxGrade}%`,
      splits: b.splitCount,
      walked: `${(b.walkRatio * 100).toFixed(0)}%`,
    })),
  )

  // ── 5. Trouver le seuil : premier bucket (pente croissante) où walkRatio ≥ 0.5
  const eligibleBuckets = buckets.filter((b) => b.splitCount >= MIN_SPLITS_PER_BUCKET)

  if (eligibleBuckets.length < 2) {
    console.warn(`[WalkGrade] Only ${eligibleBuckets.length} buckets with enough data — cannot determine threshold`)
    return null
  }

  let walkingThresholdGrade: number | null = null
  for (let i = 0; i < eligibleBuckets.length; i++) {
    const bucket = eligibleBuckets[i]
    if (bucket.walkRatio >= WALK_RATIO_THRESHOLD) {
      if (i === 0) {
        walkingThresholdGrade = bucket.minGrade
      } else {
        // Interpolation linéaire entre le bucket précédent (<0.5) et celui-ci (≥0.5)
        const prev = eligibleBuckets[i - 1]
        const span = bucket.walkRatio - prev.walkRatio
        const t = span > 0 ? (WALK_RATIO_THRESHOLD - prev.walkRatio) / span : 0
        const prevMid = (prev.minGrade + prev.maxGrade) / 2
        const curMid = (bucket.minGrade + bucket.maxGrade) / 2
        walkingThresholdGrade = prevMid + t * (curMid - prevMid)
      }
      break
    }
  }

  // Si aucun bucket ne franchit le seuil, on ne peut rien conclure
  if (walkingThresholdGrade === null) {
    const maxRatio = Math.max(...eligibleBuckets.map((b) => b.walkRatio))
    console.warn(`[WalkGrade] No bucket crossed ${WALK_RATIO_THRESHOLD} walk ratio (max=${maxRatio.toFixed(2)}) — threshold undetermined`)
    return null
  }

  walkingThresholdGrade = Math.round(walkingThresholdGrade * 10) / 10

  console.log(`[WalkGrade] ✓ Detected walking threshold: ${walkingThresholdGrade}%`)

  return {
    walkingThresholdGrade,
    runningPaceRefSecPerKm: Math.round(runningPaceRef),
    totalSplits: enriched.length,
    walkedSplits: walkedCount,
    gradeBuckets: buckets,
  }
}
