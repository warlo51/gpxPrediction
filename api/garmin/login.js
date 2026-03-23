// api/garmin/login.js
// Implémentation manuelle du flow login Garmin Connect + MFA
// car garmin-connect@1.6.2 ne gère pas le MFA (TODO non implémenté)
//
// Étape 1 : POST { username, password }
//   → on fait le login Garmin manuellement
//   → si MFA requis : on retourne { mfa_required: true, state: <données intermédiaires> }
//
// Étape 2 : POST { username, password, mfaCode, state }
//   → on soumet le code MFA sur l'endpoint Garmin
//   → on retourne les tokens OAuth

import axios from 'axios'
import qs from 'qs'
import FormData from 'form-data'
import crypto from 'crypto'
import OAuth from 'oauth-1.0a'

const GARMIN_SSO = 'https://sso.garmin.com/sso'
const SIGNIN_URL = `${GARMIN_SSO}/signin`
const GARMIN_SSO_EMBED = `${GARMIN_SSO}/embed`
const GC_MODERN = 'https://connect.garmin.com/modern'
const OAUTH_URL = 'https://connectapi.garmin.com/oauth-service/oauth'
const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'
const USER_AGENT_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
const USER_AGENT_MOBILE = 'com.garmin.android.apps.connectmobile'

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/
const TICKET_RE = /ticket=([^"]+)"/
const MFA_TOKEN_RE = /name="embed"\s+value="(.+?)"/

async function getOauthConsumer() {
  const res = await axios.get(OAUTH_CONSUMER_URL)
  return { key: res.data.consumer_key, secret: res.data.consumer_secret }
}

function makeOauthClient(consumer) {
  return new OAuth({
    consumer,
    signature_method: 'HMAC-SHA1',
    hash_function: (base, key) => crypto.createHmac('sha1', key).update(base).digest('base64'),
  })
}

async function exchangeOauth(oauth1Token, consumer) {
  const oauth = makeOauthClient(consumer)
  const token = { key: oauth1Token.oauth_token, secret: oauth1Token.oauth_token_secret }
  const baseUrl = `${OAUTH_URL}/exchange/user/2.0`
  const requestData = { url: baseUrl, method: 'POST', data: null }
  const authData = oauth.authorize(requestData, token)
  const url = `${baseUrl}?${qs.stringify(authData)}`
  const res = await axios.post(url, null, {
    headers: { 'User-Agent': USER_AGENT_MOBILE, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  return res.data
}

async function getOauth1Token(ticket, consumer) {
  const oauth = makeOauthClient(consumer)
  const params = { ticket, 'login-url': GARMIN_SSO_EMBED, 'accepts-mfa-tokens': true }
  const url = `${OAUTH_URL}/preauthorized?${qs.stringify(params)}`
  const requestData = { url, method: 'GET' }
  const headers = oauth.toHeader(oauth.authorize(requestData))
  const res = await axios.get(url, { headers: { ...headers, 'User-Agent': USER_AGENT_MOBILE } })
  return qs.parse(res.data)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password, mfaCode, state } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' })

  try {
    // ── Initialiser la session axios avec cookies
    const client = axios.create({ withCredentials: true })
    const cookieJar = {}

    // Helper pour gérer les cookies manuellement
    function extractCookies(response) {
      const setCookie = response.headers['set-cookie'] || []
      for (const cookie of setCookie) {
        const [pair] = cookie.split(';')
        const [k, v] = pair.split('=')
        if (k && v !== undefined) cookieJar[k.trim()] = v.trim()
      }
    }
    function getCookieHeader() {
      return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ')
    }

    if (mfaCode && state) {
      // ─────────────────────────────────────────────────────────
      // ÉTAPE 2 : Soumettre le code MFA
      // ─────────────────────────────────────────────────────────
      const { mfaUrl, csrf, cookies: savedCookies } = state
      const savedCookieJar = savedCookies || {}
      Object.assign(cookieJar, savedCookieJar)

      const mfaForm = new FormData()
      mfaForm.append('mfa-code', mfaCode)
      mfaForm.append('embed', 'true')
      mfaForm.append('_csrf', csrf)
      mfaForm.append('fromPage', 'setupEnterMfaCode')

      const mfaRes = await client.post(mfaUrl, mfaForm, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT_BROWSER,
          'Cookie': getCookieHeader(),
          'Origin': GARMIN_SSO,
          'Referer': mfaUrl,
        },
        maxRedirects: 5,
      })
      extractCookies(mfaRes)

      const ticketMatch = TICKET_RE.exec(mfaRes.data)
      if (!ticketMatch) {
        return res.status(401).json({ error: 'Code MFA invalide ou expiré — réessayez' })
      }
      const ticket = ticketMatch[1]

      const consumer = await getOauthConsumer()
      const oauth1Token = await getOauth1Token(ticket, consumer)
      const oauth2Token = await exchangeOauth(oauth1Token, consumer)

      // Profil
      let profile = null
      try {
        const profileRes = await axios.get('https://connect.garmin.com/userprofile-service/socialProfile', {
          headers: { Authorization: `Bearer ${oauth2Token.access_token}` }
        })
        profile = profileRes.data
      } catch (_) {}

      return res.status(200).json({
        oauth1Token,
        oauth2Token,
        displayName: profile?.displayName ?? profile?.userName ?? username,
        profileImageUrl: profile?.profileImageUrlLarge ?? profile?.profileImageUrl ?? null,
      })

    } else {
      // ─────────────────────────────────────────────────────────
      // ÉTAPE 1 : Login initial
      // ─────────────────────────────────────────────────────────

      // Step 1 : Obtenir les cookies initiaux
      const step1Params = { clientId: 'GarminConnect', locale: 'en', service: GC_MODERN }
      const step1Res = await client.get(`${GARMIN_SSO_EMBED}?${qs.stringify(step1Params)}`, {
        headers: { 'User-Agent': USER_AGENT_BROWSER }
      })
      extractCookies(step1Res)

      // Step 2 : Obtenir le token CSRF
      const step2Params = { id: 'gauth-widget', embedWidget: true, locale: 'en', gauthHost: GARMIN_SSO_EMBED }
      const step2Res = await client.get(`${SIGNIN_URL}?${qs.stringify(step2Params)}`, {
        headers: { 'User-Agent': USER_AGENT_BROWSER, 'Cookie': getCookieHeader() }
      })
      extractCookies(step2Res)

      const csrfMatch = CSRF_RE.exec(step2Res.data)
      if (!csrfMatch) throw new Error('CSRF token non trouvé')
      const csrf = csrfMatch[1]

      // Step 3 : Soumettre les credentials
      const signinParams = {
        id: 'gauth-widget', embedWidget: true, clientId: 'GarminConnect', locale: 'en',
        gauthHost: GARMIN_SSO_EMBED, service: GARMIN_SSO_EMBED,
        source: GARMIN_SSO_EMBED,
        redirectAfterAccountLoginUrl: GARMIN_SSO_EMBED,
        redirectAfterAccountCreationUrl: GARMIN_SSO_EMBED
      }
      const step3Form = new FormData()
      step3Form.append('username', username)
      step3Form.append('password', password)
      step3Form.append('embed', 'true')
      step3Form.append('_csrf', csrf)

      const step3Res = await client.post(`${SIGNIN_URL}?${qs.stringify(signinParams)}`, step3Form, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT_BROWSER,
          'Cookie': getCookieHeader(),
          'Origin': GARMIN_SSO,
          'Referer': SIGNIN_URL,
        },
        maxRedirects: 5,
      })
      extractCookies(step3Res)
      const html = step3Res.data

      // Vérifier si le login a réussi directement (pas de MFA)
      const ticketMatch = TICKET_RE.exec(html)
      if (ticketMatch) {
        const ticket = ticketMatch[1]
        const consumer = await getOauthConsumer()
        const oauth1Token = await getOauth1Token(ticket, consumer)
        const oauth2Token = await exchangeOauth(oauth1Token, consumer)

        let profile = null
        try {
          const profileRes = await axios.get('https://connect.garmin.com/userprofile-service/socialProfile', {
            headers: { Authorization: `Bearer ${oauth2Token.access_token}` }
          })
          profile = profileRes.data
        } catch (_) {}

        return res.status(200).json({
          oauth1Token,
          oauth2Token,
          displayName: profile?.displayName ?? profile?.userName ?? username,
          profileImageUrl: profile?.profileImageUrlLarge ?? profile?.profileImageUrl ?? null,
        })
      }

      // Chercher le formulaire MFA dans la réponse HTML
      const mfaCsrfMatch = CSRF_RE.exec(html)
      const hasMfaForm = html.includes('mfa-code') || html.includes('MFA') || html.includes('verification')

      if (hasMfaForm && mfaCsrfMatch) {
        // MFA requis — on retourne l'état nécessaire pour l'étape 2
        // L'URL MFA est généralement la même que step3 ou extraite du HTML
        const mfaUrl = `${SIGNIN_URL}?${qs.stringify(signinParams)}`
        return res.status(200).json({
          mfa_required: true,
          state: {
            mfaUrl,
            csrf: mfaCsrfMatch[1],
            cookies: { ...cookieJar },
          }
        })
      }

      // Vérifier compte bloqué
      if (html.includes('AccountLocked') || html.includes('account is locked')) {
        return res.status(401).json({ error: 'Compte Garmin bloqué — déverrouillez-le sur connect.garmin.com' })
      }

      throw new Error('Login échoué — vérifiez vos identifiants Garmin')
    }

  } catch (err) {
    const message = err?.response?.data ?? err?.message ?? 'Erreur de connexion Garmin'
    const msgStr = typeof message === 'string' ? message : JSON.stringify(message)
    if (msgStr.includes('403') || msgStr.includes('401')) {
      return res.status(401).json({ error: 'Identifiants Garmin incorrects' })
    }
    if (msgStr.includes('429')) {
      return res.status(429).json({ error: 'Trop de tentatives — réessayez dans quelques minutes' })
    }
    return res.status(500).json({ error: msgStr })
  }
}
