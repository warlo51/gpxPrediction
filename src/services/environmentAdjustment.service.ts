/**
 * Service d'ajustement environnemental — impact température / humidité sur la performance.
 *
 * Formules dérivées de la littérature :
 *   - Ely et al. (2007) "Impact of weather on marathon performance"
 *   - Nybo & Sawka (2019) sur la dégradation du VO₂max en chaleur
 *   - Cheuvront & Haymes (2001) sur la dérive cardiaque thermique
 *   - Jack Daniels Running Formula (coaching reference)
 *
 * Les conditions neutres de référence sont 15°C / 50% HR — à ces valeurs,
 * tous les facteurs valent 1 (vitesse/fatigue) ou 0 (drift), et la simulation
 * reste strictement identique à l'état sans ajustement environnemental.
 */

import type { EnvironmentConditions } from '@/types'
import { NEUTRAL_ENVIRONMENT } from '@/types/simulation.types'

/** Facteurs dérivés des conditions environnementales, appliqués à la simulation */
export type EnvironmentFactor = {
  /** Multiplicateur sur la vitesse de base (≤ 1 en conditions défavorables) */
  speedFactor: number
  /** Multiplicateur sur l'accumulation horaire de fatigue (≥ 1 en conditions défavorables) */
  fatigueFactor: number
  /** Bonus de dérive cardiaque thermique en bpm/heure (≥ 0) */
  heatDriftBpmPerHour: number
}

/** Facteurs neutres : aucun impact sur la simulation */
export const NEUTRAL_ENVIRONMENT_FACTOR: EnvironmentFactor = {
  speedFactor: 1,
  fatigueFactor: 1,
  heatDriftBpmPerHour: 0,
}

/** Clamp une valeur entre min et max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Calcule les facteurs d'ajustement pour des conditions données.
 *
 * Température : pénalité linéaire au-delà de 15°C (référence).
 *
 * Humidité : deux composantes additives
 *  1. Baseline respiratoire — toujours présente, indépendante de la température
 *     (air saturé ⇒ respiration plus coûteuse, même à froid)
 *  2. Amplification thermique — majore l'effet quand il fait chaud
 *     (l'évaporation de la sueur est entravée ⇒ thermorégulation dégradée)
 *
 * @param env Conditions — si absent, retourne les facteurs neutres
 */
export function computeEnvironmentFactor(
  env?: EnvironmentConditions,
): EnvironmentFactor {
  if (!env) return NEUTRAL_ENVIRONMENT_FACTOR

  const tempC = clamp(env.temperatureC, -10, 45)
  const humidityPct = clamp(env.humidityPct, 0, 100)

  const tempRef = NEUTRAL_ENVIRONMENT.temperatureC
  const humidityRef = NEUTRAL_ENVIRONMENT.humidityPct

  // Excès au-delà des valeurs neutres (au-dessous → aucun impact positif modélisé)
  const tempExcess = Math.max(0, tempC - tempRef)
  const humidityExcess = Math.max(0, humidityPct - humidityRef)

  // Coefficient d'amplification thermique de l'humidité (0 à froid → 1 en forte chaleur)
  const heatAmplifier = clamp((tempC - 10) / 20, 0, 1)

  // ── Facteur vitesse (Ely simplifié + humidité baseline + humidité thermique)
  const tempSpeedPenalty = tempExcess * 0.008
  const humiditySpeedPenalty =
    humidityExcess * (0.0008 + 0.002 * heatAmplifier)
  const speedFactor = clamp(1 - tempSpeedPenalty - humiditySpeedPenalty, 0.65, 1)

  // ── Facteur fatigue (amplification du décroissement horaire)
  const tempFatigueBoost = tempExcess * 0.015
  const humidityFatigueBoost =
    humidityExcess * (0.0010 + 0.003 * heatAmplifier)
  const fatigueFactor = clamp(1 + tempFatigueBoost + humidityFatigueBoost, 1, 2)

  // ── Dérive cardiaque thermique (Cheuvront 2001)
  // +0.3 bpm/h par °C au-delà de 18°C, + petit contribution humidité
  const heatDriftTemp = Math.max(0, tempC - 18) * 0.3
  const heatDriftHumidity = humidityExcess * (0.01 + 0.02 * heatAmplifier)
  const heatDriftBpmPerHour = clamp(heatDriftTemp + heatDriftHumidity, 0, 12)

  return { speedFactor, fatigueFactor, heatDriftBpmPerHour }
}
