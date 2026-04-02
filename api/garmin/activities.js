// api/garmin/activities.js
// Vercel Serverless Function — Node.js ESM runtime
// GET /api/garmin/activities?limit=100&start=0

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

    const start = parseInt(req.query?.start ?? '0', 10)
    const limit = Math.min(parseInt(req.query?.limit ?? '100', 10), 100)

    const activities = await client.getActivities(start, limit)
console.log(activities)
    const RUNNING_TYPES = [
      'running',
      'street_running',    // typeKey principal Garmin pour les courses route
      'trail_running',
      'treadmill_running',
      'indoor_running',    // typeKey Garmin pour tapis de course
      'virtual_running',
      'track_running',
    ]
    const runs = activities.filter(a =>
      RUNNING_TYPES.includes((a.activityType?.typeKey ?? '').toLowerCase())
      || (a.activityName ?? '').toLowerCase().includes('run')
      || (a.activityName ?? '').toLowerCase().includes('trail')
      || (a.activityName ?? '').toLowerCase().includes('course')
    )

    return res.status(200).json({ activities: runs, total: activities.length })
  } catch (err) {
    const message = err?.message ?? 'Erreur récupération activités'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    return res.status(500).json({ error: message })
  }
}
