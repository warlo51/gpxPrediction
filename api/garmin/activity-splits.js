// api/garmin/activity-splits.js
// Vercel Serverless Function — Node.js ESM runtime
// POST /api/garmin/activity-splits
// Body : { activityIds: number[] }
// Récupère les splits (laps auto 1km) des activités demandées via l'endpoint
// /activity-service/activity/{id}/splits, séquentiellement avec throttle anti rate-limit.
// Retourne un payload compact : { splits: Record<activityId, CompactSplit[]> }.

import pkg from '@flow-js/garmin-connect'
const { GarminConnect } = pkg

const MAX_ACTIVITIES = 25 // garde-fou : on ne descend jamais en dessous de ce nombre
const THROTTLE_MS = 150  // délai entre deux appels Garmin pour éviter rate-limit

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-garmin-oauth1, x-garmin-oauth2')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

  // ── Parse & validate body
  const body = req.body ?? {}
  const activityIds = Array.isArray(body.activityIds) ? body.activityIds : []
  if (activityIds.length === 0) {
    return res.status(400).json({ error: 'activityIds requis (array non vide)' })
  }
  const ids = activityIds.slice(0, MAX_ACTIVITIES).filter((id) => typeof id === 'number' && id > 0)
  if (ids.length === 0) {
    return res.status(400).json({ error: 'activityIds invalides' })
  }

  try {
    const client = new GarminConnect({ username: '', password: '' })
    client.loadToken(oauth1, oauth2)

    const t0 = Date.now()
    const splits = {}
    const errors = []

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      try {
        // Endpoint Garmin : /activity-service/activity/{id}/splits
        // Retourne { lapDTOs: [...] } avec un DTO par auto-lap (1km par défaut).
        const url = `https://connectapi.garmin.com/activity-service/activity/${id}/splits`
        const data = await client.client.get(url)

        const laps = Array.isArray(data?.lapDTOs) ? data.lapDTOs : []
        splits[id] = laps.map((lap) => ({
          distance: lap.distance ?? null,            // mètres
          duration: lap.duration ?? null,            // secondes
          elevationGain: lap.elevationGain ?? null,  // mètres
          elevationLoss: lap.elevationLoss ?? null,  // mètres
          averageSpeed: lap.averageSpeed ?? null,    // m/s
          averageHR: lap.averageHR ?? null,          // bpm
        }))
      } catch (err) {
        const msg = err?.message ?? 'unknown error'
        errors.push({ activityId: id, error: msg })
        splits[id] = []

        // Sur 429 on abandonne les suivants — on retourne ce qu'on a déjà
        if (msg.includes('429') || msg.includes('Too Many')) break
      }

      // Throttle pour éviter rate-limit (sauf dernière itération)
      if (i < ids.length - 1) await delay(THROTTLE_MS)
    }

    const durationMs = Date.now() - t0
    const successCount = Object.values(splits).filter((arr) => arr.length > 0).length

    return res.status(200).json({
      count: successCount,
      requested: ids.length,
      durationMs,
      splits,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const message = err?.message ?? 'Erreur récupération splits'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    if (message.includes('429') || message.includes('Too Many')) {
      return res.status(429).json({ error: 'Garmin rate-limit atteint — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: message })
  }
}
