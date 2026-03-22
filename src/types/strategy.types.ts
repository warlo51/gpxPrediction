/**
 * Types liés aux stratégies de course
 */

import type { ValueRange } from './runner.types'

/** Identifiants des stratégies disponibles */
export type StrategyId =
  | 'conservative'
  | 'performance'
  | 'negative_split'
  | 'positive_split'
  | 'custom'

/** Description d'une zone d'allure (ex: zones 1 à 5) */
export type PaceZone = {
  id: string
  name: string
  /** Plage d'allure en s/km */
  paceRange: ValueRange
  /** Plage FC correspondante en bpm */
  heartRateRange: ValueRange
  /** Couleur associée pour l'affichage */
  color: string
}

/** Définition complète d'une stratégie de course */
export type RacingStrategy = {
  id: StrategyId
  name: string
  description: string
  /**
   * Facteur d'effort par phase de course (0.0 à 1.0)
   * début / milieu / fin
   */
  effortCurve: [number, number, number]
  /**
   * Aggressivité en montée (0 = économise en montée, 1 = pousse en montée)
   */
  uphillAggressiveness: number
  /**
   * Récupération en descente (0 = descend vite, 1 = récupère en descente)
   */
  downhillRecovery: number
  /** Couleur thème de la stratégie */
  color: string
}

/** Recommandation par segment pour une stratégie donnée */
export type StrategySegment = {
  segmentId: string
  /** Facteur d'effort spécifique à ce segment (0.0 à 1.0) */
  effortFactor: number
  /** Zone d'allure recommandée */
  paceZone: PaceZone
  /** Conseil textuel contextuel */
  advice?: string
}
