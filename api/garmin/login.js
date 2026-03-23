// api/garmin/login.js
// Implémentation manuelle du flow login Garmin Connect + MFA
// URLs mises à jour pour le nouveau SSO Garmin (2025+)

import axios from 'axios'
import qs from 'qs'
import FormData from 'form-data'
import crypto from 'crypto'
import OAuth from 'oauth-1.0a'

// URLs Garmin SSO — mises à jour pour le nouveau système d'auth
const GARMIN_SSO_ORIGIN = 'https://sso.garmin.com'
const GARMIN_SSO = 'https://sso.garmin.com/sso'
const SIGNIN_URL = `${GARMIN_SSO}/signinremote`  // nouveau endpoint (remplace /signin)
const GARMIN_SSO_EMBED = `${GARMIN_SSO}/embed`
const GC_MODERN = 'https://connect.garmin.com/modern'
const OAUTH_URL = 'https://connectapi.garmin.com/oauth-service/oauth'
const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'
const USER_AGENT_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const USER_AGENT_MOBILE = 'com.garmin.android.apps.connectmobile'

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/
const TICKET_RE = /ticket=([^"&\s]+)/
const MFA_PAGE_RE = /id="mfa-code"|name="mfa-code"|enterMFACode|verificationCode/i

async function getOauthConsumer() {
  const res = await axios.get(OAUTH_CONSUMER_URL, { timeout: 10000 })
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
  const r = await axios.post(url, null, {
    headers: { 'User-Agent': USER_AGENT_MOBILE, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  })
  return r.data
}

async function getOauth1Token(ticket, consumer) {
  const oauth = makeOauthClient(consumer)
  const params = { ticket, 'login-url': GARMIN_SSO_EMBED, 'accepts-mfa-tokens': true }
  const url = `${OAUTH_URL}/preauthorized?${qs.stringify(params)}`
  const headers = oauth.toHeader(oauth.authorize({ url, method: 'GET' }))
  const r = await axios.get(url, {
    headers: { ...headers, 'User-Agent': USER_AGENT_MOBILE },
    timeout: 10000,
  })
  return qs.parse(r.data)
}

// Helper cookies
function makeCookieJar() {
  const jar = {}
  return {
    extract(response) {
      for (const cookie of response.headers['set-cookie'] || []) {
        const [pair] = cookie.split(';')
        const idx = pair.indexOf('=')
        if (idx > 0) {
          const k = pair.slice(0, idx).trim()
          const v = pair.slice(idx + 1).trim()
          jar[k] = v
        }
      }
    },
    header() {
      return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')
    },
    merge(saved) { Object.assign(jar, saved || {}) },
    toJSON() { return { ...jar } },
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password, mfaCode, state } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' })

  const cookies = makeCookieJar()
  const client = axios.create({ maxRedirects: 5, timeout: 15000 })

  // Paramètres communs signin
  const signinParams = {
    id: 'gauth-widget',
    embedWidget: 'true',
    clientId: 'GarminConnect',
    locale: 'en',
    gauthHost: GARMIN_SSO_EMBED,
    service: GC_MODERN,
    source: GARMIN_SSO_EMBED,
    redirectAfterAccountLoginUrl: GC_MODERN,
    redirectAfterAccountCreationUrl: GC_MODERN,
  }

  try {
    // ─────────────────────────────────────────────────────────────────
    // ÉTAPE 2 : soumission du code MFA
    // ─────────────────────────────────────────────────────────────────
    if (mfaCode && state) {
      cookies.merge(state.cookies)

      const form = new FormData()
      form.append('mfa-code', mfaCode.trim())
      form.append('embed', 'true')
      form.append('_csrf', state.csrf)
      form.append('fromPage', 'setupEnterMfaCode')

      const mfaRes = await client.post(state.mfaUrl, form, {
        headers: {
          ...form.getHeaders(),
          'User-Agent': USER_AGENT_BROWSER,
          'Cookie': cookies.header(),
          'Origin': GARMIN_SSO_ORIGIN,
          'Referer': state.mfaUrl,
        },
      })
      cookies.extract(mfaRes)
      const html = mfaRes.data

      // Chercher le ticket dans la réponse
      const ticketMatch = TICKET_RE.exec(html)
      if (!ticketMatch) {
        // Debug : retourner un extrait du HTML pour diagnostic
        const snippet = typeof html === 'string' ? html.slice(0, 500) : JSON.stringify(html)
        return res.status(401).json({
          error: 'Code MFA invalide ou expiré',
          debug: snippet,
        })
      }

      const consumer = await getOauthConsumer()
      const oauth1Token = await getOauth1Token(ticketMatch[1], consumer)
      const oauth2Token = await exchangeOauth(oauth1Token, consumer)

      let profile = null
      try {
        const p = await axios.get('https://connect.garmin.com/userprofile-service/socialProfile', {
          headers: { Authorization: `Bearer ${oauth2Token.access_token}` },
          timeout: 8000,
        })
        profile = p.data
      } catch (_) {}

      return res.status(200).json({
        oauth1Token, oauth2Token,
        displayName: profile?.displayName ?? profile?.userName ?? username,
        profileImageUrl: profile?.profileImageUrlLarge ?? profile?.profileImageUrl ?? null,
      })
    }

    // ─────────────────────────────────────────────────────────────────
    // ÉTAPE 1 : login initial
    // ─────────────────────────────────────────────────────────────────

    // Step 1 : cookies SSO initiaux
    const s1 = await client.get(`${GARMIN_SSO_EMBED}?${qs.stringify({
      clientId: 'GarminConnect', locale: 'en', service: GC_MODERN,
    })}`, { headers: { 'User-Agent': USER_AGENT_BROWSER } })
    cookies.extract(s1)

    // Step 2 : page signin → CSRF
    const s2 = await client.get(`${SIGNIN_URL}?${qs.stringify(signinParams)}`, {
      headers: { 'User-Agent': USER_AGENT_BROWSER, 'Cookie': cookies.header() },
    })
    cookies.extract(s2)

    const csrfMatch = CSRF_RE.exec(s2.data)
    if (!csrfMatch) {
      return res.status(500).json({
        error: 'CSRF introuvable — Garmin a peut-être changé son interface',
        debug: typeof s2.data === 'string' ? s2.data.slice(0, 300) : '',
      })
    }

    // Step 3 : soumission credentials
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    form.append('embed', 'true')
    form.append('_csrf', csrfMatch[1])

    const s3 = await client.post(`${SIGNIN_URL}?${qs.stringify(signinParams)}`, form, {
      headers: {
        ...form.getHeaders(),
        'User-Agent': USER_AGENT_BROWSER,
        'Cookie': cookies.header(),
        'Origin': GARMIN_SSO_ORIGIN,
        'Referer': `${SIGNIN_URL}?${qs.stringify(signinParams)}`,
      },
    })
    cookies.extract(s3)
    const html = s3.data

    // Ticket direct (pas de MFA) ?
    const ticketMatch = TICKET_RE.exec(html)
    if (ticketMatch) {
      const consumer = await getOauthConsumer()
      const oauth1Token = await getOauth1Token(ticketMatch[1], consumer)
      const oauth2Token = await exchangeOauth(oauth1Token, consumer)

      let profile = null
      try {
        const p = await axios.get('https://connect.garmin.com/userprofile-service/socialProfile', {
          headers: { Authorization: `Bearer ${oauth2Token.access_token}` },
          timeout: 8000,
        })
        profile = p.data
      } catch (_) {}

      return res.status(200).json({
        oauth1Token, oauth2Token,
        displayName: profile?.displayName ?? profile?.userName ?? username,
        profileImageUrl: profile?.profileImageUrlLarge ?? profile?.profileImageUrl ?? null,
      })
    }

    // Page MFA ?
    const mfaCsrfMatch = CSRF_RE.exec(html)
    const isMfaPage = MFA_PAGE_RE.test(html) || (mfaCsrfMatch && !TICKET_RE.test(html))

    if (isMfaPage && mfaCsrfMatch) {
      return res.status(200).json({
        mfa_required: true,
        state: {
          mfaUrl: `${SIGNIN_URL}?${qs.stringify(signinParams)}`,
          csrf: mfaCsrfMatch[1],
          cookies: cookies.toJSON(),
        },
      })
    }

    // Compte bloqué ?
    if (html.includes('AccountLocked') || html.includes('account is locked')) {
      return res.status(401).json({ error: 'Compte Garmin bloqué — déverrouillez-le sur connect.garmin.com' })
    }

    // Mauvais identifiants ?
    if (html.includes('Invalid') || html.includes('incorrect') || html.includes('error-message')) {
      return res.status(401).json({ error: 'Email ou mot de passe Garmin incorrect' })
    }

    // Inconnu — retourner un extrait HTML pour debug
    return res.status(500).json({
      error: 'Réponse Garmin inattendue',
      debug: typeof html === 'string' ? html.slice(0, 600) : JSON.stringify(html).slice(0, 300),
    })

  } catch (err) {
    const status = err?.response?.status
    const data = err?.response?.data
    const message = err?.message ?? 'Erreur inconnue'

    // Retourner le max de détails pour aider au debug
    return res.status(500).json({
      error: `Erreur ${status ?? ''}: ${message}`.trim(),
      debug: typeof data === 'string' ? data.slice(0, 400) : JSON.stringify(data ?? {}).slice(0, 400),
    })
  }
}
