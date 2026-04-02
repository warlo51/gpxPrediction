// api/garmin/wellness.js
// Vercel Serverless Function — Node.js ESM runtime
// GET /api/garmin/wellness?date=2024-01-15
// Retourne les données wellness pour une date donnée :
// sommeil (+ HRV, body battery), FC de repos, pas journaliers

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

    // Date cible (défaut : aujourd'hui)
    const dateStr = req.query?.date
    const date = dateStr ? new Date(dateStr) : new Date()

    // Récupérer sleep, HR et steps en parallèle — chaque appel est indépendant
    const [sleepResult, heartRateResult, stepsResult] = await Promise.allSettled([
      client.getSleepData(date),
      client.getHeartRate(date),
      client.getSteps(date),
    ])

    return res.status(200).json({
      date: date.toISOString().slice(0, 10),
      sleep: sleepResult.status === 'fulfilled' ? sleepResult.value : null,
      heartRate: heartRateResult.status === 'fulfilled' ? heartRateResult.value : null,
      steps: stepsResult.status === 'fulfilled' ? stepsResult.value : null,
    })
  } catch (err) {
    const message = err?.message ?? 'Erreur récupération wellness'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    if (message.includes('429') || message.includes('Too Many')) {
      return res.status(429).json({ error: 'Garmin rate-limit atteint — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: message })
  }
}
