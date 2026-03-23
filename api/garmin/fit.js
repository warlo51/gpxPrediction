// api/garmin/fit.js
// Vercel Serverless Function — Node.js ESM runtime
// GET /api/garmin/fit?activityId=123456

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
  const activityId = req.query?.activityId

  if (!oauth1Header || !oauth2Header) {
    return res.status(401).json({ error: 'Tokens manquants' })
  }
  if (!activityId) {
    return res.status(400).json({ error: 'activityId requis' })
  }

  try {
    const oauth1 = JSON.parse(oauth1Header)
    const oauth2 = JSON.parse(oauth2Header)

    const client = new GarminConnect({ username: '', password: '' })
    client.loadToken(oauth1, oauth2)

    const fitBuffer = await client.downloadOriginalActivityData(
      { activityId: parseInt(activityId, 10) },
      null
    )

    if (!fitBuffer) {
      return res.status(404).json({ error: 'Fichier FIT non disponible pour cette activité' })
    }

    const buffer = Buffer.isBuffer(fitBuffer) ? fitBuffer : Buffer.from(fitBuffer)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', buffer.length)
    return res.status(200).send(buffer)
  } catch (err) {
    const message = err?.message ?? 'Erreur téléchargement FIT'
    if (message.includes('401') || message.includes('403')) {
      return res.status(401).json({ error: 'Session expirée — reconnectez-vous' })
    }
    if (message.includes('404')) {
      return res.status(404).json({ error: 'Activité non trouvée' })
    }
    return res.status(500).json({ error: message })
  }
}
