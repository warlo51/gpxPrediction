// api/garmin/race-predictions.js
// Vercel Serverless Function — Node.js ESM runtime
// GET /api/garmin/race-predictions
// Retourne les prédictions de course calculées par Garmin/Firstbeat :
// temps estimés sur 5K, 10K, semi-marathon et marathon.
//
// Stratégie en deux temps :
// 1. Tenter l'endpoint natif Garmin race predictor
// 2. Fallback : calculer depuis VO2max via la formule Jack Daniels

import pkg from '@flow-js/garmin-connect'
const { GarminConnect } = pkg

// ─── Fallback : prédictions depuis VO2max (Jack Daniels) ──────────────────────

/**
 * Calcule la vitesse à VO2max (m/s) depuis le VO2max (mL/kg/min)
 * en inversant la formule de Daniels :
 *   VO2 = 0.000104 × v² + 0.182258 × v - 4.60   (v en m/min)
 * Résolution quadratique → v en m/s
 */
function vVo2maxFromVo2max(vo2max) {
  const a = 0.000104
  const b = 0.182258
  const c = -(vo2max + 4.60)
  const vMperMin = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
  return vMperMin / 60 // m/s
}

/**
 * Estime les temps de course depuis le VO2max via la table VDOT de Daniels.
 * Pourcentages d'utilisation par distance :
 *   5K  ≈ 98%  vVO2max
 *   10K ≈ 90%  vVO2max
 *   HM  ≈ 84%  vVO2max
 *   M   ≈ 76%  vVO2max
 */
function computePredictionsFromVo2max(vo2max) {
  const vVo2max = vVo2maxFromVo2max(vo2max)
  return {
    fiveK: Math.round(5000 / (vVo2max * 0.98)),
    tenK: Math.round(10000 / (vVo2max * 0.90)),
    halfMarathon: Math.round(21097 / (vVo2max * 0.84)),
    marathon: Math.round(42195 / (vVo2max * 0.76)),
    source: 'computed',
    updatedAt: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-garmin-oauth1, x-garmin-oauth2')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const oauth1Header = req.headers['x-garmin-oauth1']
  const oauth2Header = req.headers['x-garmin-oauth2']

  if (!oauth1Header || !oauth2Header) {
    return res.status(401).json({ error: 'Tokens Garmin manquants — reconnectez-vous' })
  }

  let oauth1, oauth2
  try {
    oauth1 = JSON.parse(oauth1Header)
    oauth2 = JSON.parse(oauth2Header)
    if (!oauth1?.oauth_token || !oauth2?.access_token) {
      return res.status(401).json({ error: 'Tokens Garmin invalides — reconnectez-vous' })
    }
  } catch {
    return res.status(401).json({ error: 'Tokens Garmin malformés — reconnectez-vous' })
  }

  try {
    const client = new GarminConnect({ username: '', password: '' })
    client.loadToken(oauth1, oauth2)

    // ── 1. Récupérer le profil (displayName) + VO2max en parallèle
    const [profileResult, settingsResult] = await Promise.allSettled([
      client.getUserProfile(),
      client.getUserSettings(),
    ])

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const vo2max = settings?.userData?.vo2MaxRunning ?? null
    const displayName = profile?.displayName ?? profile?.userName ?? null

    // ── 2. Tenter l'endpoint Firstbeat race predictor natif Garmin
    //    Endpoint authentique : /metrics-service/metrics/racepredictions/latest/{displayName}
    //    Retourne les prédictions Firstbeat (basées sur VO2max + historique récent + VFC)
    if (displayName) {
      try {
        const racePredictions = await client.get(
          `https://connectapi.garmin.com/metrics-service/metrics/racepredictions/latest/${encodeURIComponent(displayName)}`,
        )
        console.log('[race-predictions] raw Garmin response:', JSON.stringify(racePredictions))

        // La réponse Garmin peut être un objet { raceTime5K, raceTime10K, raceTimeHalf, raceTimeMarathon }
        // ou un tableau d'objets avec raceDistance/raceTime selon la version de l'API.
        let fiveK = null, tenK = null, halfMarathon = null, marathon = null

        if (racePredictions && typeof racePredictions === 'object') {
          if (Array.isArray(racePredictions)) {
            const find = (key) => {
              const entry = racePredictions.find(p =>
                (p.raceDistance ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') === key
              )
              return entry?.raceTime ?? null
            }
            fiveK = find('5K')
            tenK = find('10K')
            halfMarathon = find('HALFMARATHON')
            marathon = find('MARATHON')
          } else {
            // Forme objet plate
            fiveK = racePredictions.raceTime5K ?? racePredictions.time5K ?? null
            tenK = racePredictions.raceTime10K ?? racePredictions.time10K ?? null
            halfMarathon = racePredictions.raceTimeHalf ?? racePredictions.raceTimeHalfMarathon ?? racePredictions.timeHalf ?? null
            marathon = racePredictions.raceTimeMarathon ?? racePredictions.timeMarathon ?? null
          }
        }

        if (fiveK || tenK || halfMarathon || marathon) {
          return res.status(200).json({
            fiveK,
            tenK,
            halfMarathon,
            marathon,
            source: 'garmin',
            updatedAt: new Date().toISOString(),
          })
        }
      } catch (predicterErr) {
        // Endpoint non disponible — continuer vers le fallback
        console.warn('[race-predictions] race predictor endpoint unavailable:', predicterErr?.message)
      }
    }

    // ── 3. Fallback : calculer depuis VO2max
    if (vo2max && vo2max > 20) {
      return res.status(200).json(computePredictionsFromVo2max(vo2max))
    }

    // ── 4. Aucune donnée disponible
    return res.status(200).json({
      fiveK: null,
      tenK: null,
      halfMarathon: null,
      marathon: null,
      source: 'unavailable',
      updatedAt: null,
    })
  } catch (err) {
    const message = err?.message ?? 'Erreur récupération prédictions de course'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    if (message.includes('429') || message.includes('Too Many')) {
      return res.status(429).json({ error: 'Garmin rate-limit atteint — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: 'Erreur récupération prédictions' })
  }
}
