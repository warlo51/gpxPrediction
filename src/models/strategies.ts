/**
 * Définition des stratégies de course prédéfinies
 */

import type { RacingStrategy, StrategyId } from '@/types'

export const RACING_STRATEGIES: Record<StrategyId, RacingStrategy> = {
  conservative: {
    id: 'conservative',
    name: 'Conservative',
    description: 'Effort stable et maîtrisé du début à la fin. Idéal pour les longues distances ou les premiers trails.',
    effortCurve: [0.97, 0.98, 0.97],   // légèrement sous le nominal, très stable
    uphillAggressiveness: 0.3,
    downhillRecovery: 0.8,
    color: '#22c55e',
  },

  performance: {
    id: 'performance',
    name: 'Performance ✨ Recommandée',
    description: 'Effort optimisé : pousse en montée, récupère en descente. Pour coureurs expérimentés.',
    effortCurve: [1.0, 1.02, 1.0],     // centré sur 1.0 = allure nominale du profil
    uphillAggressiveness: 0.8,
    downhillRecovery: 0.4,
    color: '#f97316',
  },

  negative_split: {
    id: 'negative_split',
    name: 'Negative Split',
    description: 'Départ prudent, montée en puissance progressive. Stratégie efficace pour finir fort.',
    effortCurve: [0.95, 1.0, 1.05],    // commence prudemment, accélère en fin
    uphillAggressiveness: 0.5,
    downhillRecovery: 0.6,
    color: '#6366f1',
  },

  positive_split: {
    id: 'positive_split',
    name: 'Positive Split',
    description: 'Départ rapide, gestion de la fatigue en fin de course. Risqué mais possible sur courte distance.',
    effortCurve: [1.05, 1.0, 0.95],    // départ au-dessus du nominal, finit en dessous
    uphillAggressiveness: 0.6,
    downhillRecovery: 0.5,
    color: '#f59e0b',
  },

  montagnard: {
    id: 'montagnard',
    name: 'Montagnard',
    description: 'Marche systématique en montée, course efficace sur plats et descentes. Idéal pour les parcours très vallonnés ou les ultras.',
    effortCurve: [0.98, 0.98, 0.97],  // très stable, légère baisse en fin
    uphillAggressiveness: 0.1,          // économise au maximum en montée
    downhillRecovery: 0.15,             // exploite les descentes (quasi pas de récupération)
    color: '#0ea5e9',
  },

  all_out: {
    id: 'all_out',
    name: 'All-Out',
    description: 'Effort soutenu élevé du début à la fin. Pour trails courts (< 30 km) où l\'objectif est le chrono.',
    effortCurve: [1.03, 1.05, 1.02],   // au-dessus du nominal partout
    uphillAggressiveness: 0.9,           // pousse fort en montée
    downhillRecovery: 0.1,              // pas de récupération, exploite tout
    color: '#dc2626',
  },

  custom: {
    id: 'custom',
    name: 'Personnalisée',
    description: 'Stratégie entièrement personnalisable selon vos préférences.',
    effortCurve: [0.98, 1.0, 1.0],
    uphillAggressiveness: 0.5,
    downhillRecovery: 0.6,
    color: '#a855f7',
  },
}

export const STRATEGY_LIST = Object.values(RACING_STRATEGIES)
