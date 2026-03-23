// api/garmin/login.js
// Vercel Serverless Function — Node.js ESM runtime
// POST /api/garmin/login
// Body : { username, password }            → première tentative
// Body : { username, password, mfaCode }   → avec le code reçu par email

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password, mfaCode } = req.body ?? {}

  if (!username || !password) {
    return res.status(400).json({ error: 'username et password requis' })
  }

  try {
    const client = new GarminConnect({ username, password })

    if (mfaCode) {
      // ── Étape 2 : login avec le code MFA fourni par l'utilisateur
      await client.login(mfaCode)
    } else {
      // ── Étape 1 : login initial — peut déclencher l'envoi d'un email MFA
      try {
        await client.login()
      } catch (err) {
        const msg = err?.message ?? ''
        // Garmin demande un code MFA → on informe le frontend
        if (msg.toLowerCase().includes('mfa') || msg.toLowerCase().includes('ticket')) {
          return res.status(200).json({ mfa_required: true })
        }
        throw err
      }
    }

    const oauth1 = client.client.oauth1Token
    const oauth2 = client.client.oauth2Token

    if (!oauth1 || !oauth2) {
      return res.status(200).json({ mfa_required: true })
    }

    // Récupérer le profil utilisateur
    let profile = null
    try { profile = await client.getUserProfile() } catch (_) { /* optionnel */ }

    return res.status(200).json({
      oauth1Token: oauth1,
      oauth2Token: oauth2,
      displayName: profile?.displayName ?? profile?.userName ?? username,
      profileImageUrl: profile?.profileImageUrlLarge ?? profile?.profileImageUrl ?? null,
    })
  } catch (err) {
    const message = err?.message ?? 'Erreur de connexion Garmin'
    // Erreur d'auth spécifique
    if (message.includes('403') || message.includes('401') || message.toLowerCase().includes('password')) {
      return res.status(401).json({ error: 'Identifiants Garmin incorrects' })
    }
    if (message.includes('429')) {
      return res.status(429).json({ error: 'Trop de tentatives — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: message })
  }
}
