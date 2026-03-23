// api/garmin/login.js
// Vercel Serverless Function — Node.js ESM runtime
//
// Étape 1 : POST { username, password }
//   → Garmin envoie un email MFA
//   → retourne { mfa_required: true }
//
// Étape 2 : POST { username, password, mfaCode }
//   → passe le code directement au callback login
//   → retourne { oauth1Token, oauth2Token, ... }
//
// IMPORTANT : à chaque appel on recrée un client FRESH.
// En étape 2, on passe mfaCode via le callback pour que Garmin
// accepte le code sans renvoyer un nouveau email.

import pkg from 'garmin-connect'
const { GarminConnect } = pkg

export default async function handler(req, res) {
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
      // ── Étape 2 : on passe le code via un callback synchrone
      // garmin-connect appelle ce callback quand Garmin demande le MFA
      // En fournissant directement le code, on évite l'envoi d'un nouvel email
      await client.login(username, password, async () => mfaCode)
    } else {
      // ── Étape 1 : login sans code → Garmin va envoyer un email
      // On intercepte l'erreur MFA pour en informer le frontend
      let mfaWasRequested = false

      try {
        await client.login(username, password, async () => {
          // Ce callback est appelé si Garmin demande un MFA
          // On n'a pas encore le code → on lève une erreur spéciale
          mfaWasRequested = true
          throw new Error('__MFA_NEEDED__')
        })
      } catch (err) {
        const msg = err?.message ?? ''
        if (mfaWasRequested || msg === '__MFA_NEEDED__' || msg.toLowerCase().includes('mfa') || msg.toLowerCase().includes('ticket')) {
          return res.status(200).json({ mfa_required: true })
        }
        throw err
      }

      if (mfaWasRequested) {
        return res.status(200).json({ mfa_required: true })
      }
    }

    // ── Succès : récupérer les tokens
    const oauth1 = client.client?.oauth1Token
    const oauth2 = client.client?.oauth2Token

    if (!oauth1 || !oauth2) {
      // Tokens absents après login = MFA probablement encore requis
      return res.status(200).json({ mfa_required: true })
    }

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
    if (message.includes('403') || message.includes('401') || message.toLowerCase().includes('invalid')) {
      return res.status(401).json({ error: 'Identifiants Garmin incorrects' })
    }
    if (message.includes('429')) {
      return res.status(429).json({ error: 'Trop de tentatives — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: message })
  }
}
