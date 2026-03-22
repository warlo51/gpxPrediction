/**
 * Définition des stratégies de course prédéfinies
 */

import type { RacingStrategy, StrategyId } from '@/types'

export const RACING_STRATEGIES: Record<StrategyId, RacingStrategy> = {
  conservative: {
    id: 'conservative',
    name: 'Conservative',
    description: 'Effort stable et maîtrisé du début à la fin. Idéal pour les longues distances ou les premiers trails.',
    effortCurve: [0.88, 0.90, 0.92],
    uphillAggressiveness: 0.3,
    downhillRecovery: 0.8,
    color: '#22c55e',
  },

  performance: {
    id: 'performance',
    name: 'Performance',
    description: 'Effort optimisé : pousse en montée, récupère en descente. Pour coureurs expérimentés.',
    effortCurve: [0.95, 1.0, 0.97],
    uphillAggressiveness: 0.8,
    downhillRecovery: 0.4,
    color: '#f97316',
  },

  negative_split: {
    id: 'negative_split',
    name: 'Negative Split',
    description: 'Départ prudent, montée en puissance progressive. Stratégie efficace pour finir fort.',
    effortCurve: [0.85, 0.93, 1.02],
    uphillAggressiveness: 0.5,
    downhillRecovery: 0.6,
    color: '#6366f1',
  },

  positive_split: {
    id: 'positive_split',
    name: 'Positive Split',
    description: 'Départ rapide, gestion de la fatigue en fin de course. Risqué mais possible sur courte distance.',
    effortCurve: [1.05, 0.97, 0.88],
    uphillAggressiveness: 0.6,
    downhillRecovery: 0.5,
    color: '#f59e0b',
  },

  custom: {
    id: 'custom',
    name: 'Personnalisée',
    description: 'Stratégie entièrement personnalisable selon vos préférences.',
    effortCurve: [0.90, 0.95, 0.95],
    uphillAggressiveness: 0.5,
    downhillRecovery: 0.6,
    color: '#a855f7',
  },
}

export const STRATEGY_LIST = Object.values(RACING_STRATEGIES)
