// api/garmin/activities.js
// Vercel Serverless Function — Node.js ESM runtime
// GET /api/garmin/activities
// Récupère toutes les activités running de l'utilisateur via pagination complète.
// Retourne les activités brutes (sans coordonnées GPS) avec métadonnées de pagination.

import pkg from '@flow-js/garmin-connect'
const { GarminConnect } = pkg

const PAGE_SIZE = 100
const MAX_PAGES = 20 // cap de sécurité : 2000 activités max

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

    const t0 = Date.now()
    const all = []
    let start = 0
    let page = 0

    while (page < MAX_PAGES) {
      const batch = await client.getActivities(start, PAGE_SIZE, 'running')

      if (!Array.isArray(batch) || batch.length === 0) break

      all.push(...batch)
      start += batch.length
      page++

      // Dernière page incomplète → fin de la liste
      if (batch.length < PAGE_SIZE) break
    }

    const durationMs = Date.now() - t0

    // Ne garder que les activités running / trail running
    const ALLOWED_TYPE_KEYS = new Set(['running', 'trail_running'])
    const filtered = all.filter((a) => ALLOWED_TYPE_KEYS.has(a?.activityType?.typeKey))

    // Supprimer les coordonnées GPS avant de renvoyer (données sensibles)
    const activities = filtered.map(({
      activityId,
      activityType,
      activityName,
      startTimeLocal,
      distance,
      duration,
      elevationGain,
      elevationLoss,
      averageSpeed,
      averageHR,
      maxHR,
      calories,
      steps,
      trainingEffect,
      aerobicTrainingEffect,
      anaerobicTrainingEffect,
    }) => ({
      activityId,
      activityType,
      activityName,
      startTimeLocal,
      distance,
      duration,
      elevationGain,
      elevationLoss,
      averageSpeed,
      averageHR,
      maxHR,
      calories,
      steps,
      trainingEffect,
      aerobicTrainingEffect,
      anaerobicTrainingEffect,
    }))

    return res.status(200).json({
      count: activities.length,
      durationMs,
      pages: page,
      activities,
    })
  } catch (err) {
    const message = err?.message ?? 'Erreur récupération activités'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    if (message.includes('429') || message.includes('Too Many')) {
      return res.status(429).json({ error: 'Garmin rate-limit atteint — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: message })
  }
}
