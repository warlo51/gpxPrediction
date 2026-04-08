/**
 * Types liés à la simulation de course
 */

import type { GpxSegment } from './gpx.types'
import type { ValueRange } from './runner.types'

/** Résultat simulé pour un segment donné */
export type SegmentSimulation = {
  segment: GpxSegment
  /** Durée estimée en secondes */
  estimatedDuration: number
  /** Plage d'allure cible en s/km */
  paceRange: ValueRange
  /** Plage FC cible en bpm */
  heartRateRange: ValueRange
  /** Facteur de fatigue appliqué (0 = aucune fatigue, 1 = épuisement) */
  fatigueFactor: number
  /** Énergie dépensée sur ce segment en kcal */
  caloriesBurned: number
  /** Cumul temps depuis le départ en secondes */
  cumulativeTime: number
  /** Cumul calories depuis le départ */
  cumulativeCalories: number
  /** Indication si le coureur est estimé marcher */
  isWalking: boolean
}

/** Résultat complet d'une simulation */
export type SimulationResult = {
  /** Temps total estimé en secondes */
  totalDuration: number
  /** Calories totales estimées */
  totalCalories: number
  /** Résultats par segment */
  segments: SegmentSimulation[]
  /** Stratégie appliquée */
  strategyId: string
  /** Date de génération */
  generatedAt: Date
}

/** Conditions environnementales (biome) de la course */
export type EnvironmentConditions = {
  /** Température ambiante en °C (−10 à 45) */
  temperatureC: number
  /** Humidité relative en % (0 à 100) */
  humidityPct: number
}

/** Conditions neutres : aucun impact sur la simulation */
export const NEUTRAL_ENVIRONMENT: EnvironmentConditions = {
  temperatureC: 15,
  humidityPct: 50,
}

/** Paramètres d'entrée pour lancer une simulation */
export type SimulationParams = {
  strategyId: string
  /** Facteur d'effort global (0.8 = 80% de l'effort max, conservateur) */
  effortFactor: number
  /** Poids du coureur au moment de la course (optionnel, sinon profil par défaut) */
  weightKg?: number
  /** Appliquer la fatigue progressive */
  applyFatigue: boolean
  /** Appliquer la dérive cardiaque */
  applyCardiacDrift: boolean
  /** Conditions environnementales (défaut : neutres → aucun impact) */
  environment?: EnvironmentConditions
}
