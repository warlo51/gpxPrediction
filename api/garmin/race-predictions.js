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
 * Estime les temps de course depuis le VO2max via la formule de Jack Daniels.
 * vVO2max (m/s) = VO2max * 0.0345 + 0.182
 * Pourcentages d'utilisation par distance (basés sur la table VDOT) :
 *   5K  ≈ 97.5%  vVO2max
 *   10K ≈ 93%    vVO2max
 *   HM  ≈ 86%    vVO2max
 *   M   ≈ 78%    vVO2max
 */
function computePredictionsFromVo2max(vo2max) {
  const vVo2max = vo2max * 0.0345 + 0.182 // m/s à VO2max
  return {
    fiveK: Math.round(5000 / (vVo2max * 0.975)),
    tenK: Math.round(10000 / (vVo2max * 0.93)),
    halfMarathon: Math.round(21097 / (vVo2max * 0.86)),
    marathon: Math.round(42195 / (vVo2max * 0.78)),
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

    // ── 1. Récupérer le profileId + VO2max en parallèle
    const [profileResult, settingsResult] = await Promise.allSettled([
      client.getUserProfile(),
      client.getUserSettings(),
    ])

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null
    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const vo2max = settings?.userData?.vo2MaxRunning ?? null
    const profileId = profile?.profileId ?? null

    // ── 2. Tenter l'endpoint race predictor natif Garmin
    if (profileId) {
      try {
        const racePredictions = await client.get(
          `/proxy/runningracepredictor-service/racePredictions/running/${profileId}`,
        )
        // L'API Garmin retourne les temps en secondes dans racePredictions[]
        // Chaque élément : { raceDistance: '5K'|'10K'|'HALF_MARATHON'|'MARATHON', raceTime: seconds }
        if (Array.isArray(racePredictions) && racePredictions.length > 0) {
          const find = (key) => {
            const entry = racePredictions.find(p =>
              (p.raceDistance ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') === key
            )
            return entry?.raceTime ?? null
          }

          return res.status(200).json({
            fiveK: find('5K'),
            tenK: find('10K'),
            halfMarathon: find('HALFMARATHON'),
            marathon: find('MARATHON'),
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
