// api/garmin/user-stats.js
// Vercel Serverless Function — Node.js ESM runtime
// GET /api/garmin/user-stats
// Retourne les statistiques officielles Garmin du coureur :
// VO2max running, seuil lactate (vitesse + FC), profil social

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

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

  try {
    const oauth1 = JSON.parse(oauth1Header)
    const oauth2 = JSON.parse(oauth2Header)

    const client = new GarminConnect({ username: '', password: '' })
    client.loadToken(oauth1, oauth2)

    // Récupérer settings utilisateur et profil social en parallèle
    const [settingsResult, profileResult] = await Promise.allSettled([
      client.getUserSettings(),
      client.getUserProfile(),
    ])

    const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null

    return res.status(200).json({
      // VO2max et seuil lactate depuis les settings (données Firstbeat, plus fiables)
      vo2MaxRunning: settings?.userData?.vo2MaxRunning ?? null,
      vo2MaxCycling: settings?.userData?.vo2MaxCycling ?? null,
      lactateThresholdSpeed: settings?.userData?.lactateThresholdSpeed ?? null,   // m/s
      lactateThresholdHeartRate: settings?.userData?.lactateThresholdHeartRate ?? null, // bpm
      // Profil social (vitesse d'entraînement calibrée par Garmin)
      runningTrainingSpeed: profile?.runningTrainingSpeed ?? null,   // m/s
      // Métadonnées
      userLevel: profile?.userLevel ?? null,
    })
  } catch (err) {
    const message = err?.message ?? 'Erreur récupération stats utilisateur'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    if (message.includes('429') || message.includes('Too Many')) {
      return res.status(429).json({ error: 'Garmin rate-limit atteint — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: message })
  }
}
