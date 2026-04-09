// api/garmin/login.js
// Flow Garmin Connect OAuth — compatible avril 2026
// Basé sur le flow garth v0.7.1 (JSON mobile API, plus de scraping HTML)

import axios from 'axios'
import qs from 'qs'
import crypto from 'crypto'
import OAuth from 'oauth-1.0a'

// ── URLs ──────────────────────────────────────────────────────────────────────
const DOMAIN              = 'garmin.com'
const SSO_BASE            = `https://sso.${DOMAIN}`
const CONNECT_API         = `https://connectapi.${DOMAIN}`
const OAUTH_BASE          = `${CONNECT_API}/oauth-service/oauth`
const OAUTH_CONSUMER_URL  = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'
const SERVICE_URL         = `https://mobile.integration.${DOMAIN}/gcm/android`
const CLIENT_ID           = 'GCM_ANDROID_DARK'

const UA_BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const UA_MOBILE  = 'com.garmin.android.apps.connectmobile'

const SSO_PAGE_HEADERS = {
  'User-Agent': UA_BROWSER,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────
async function getOauthConsumer() {
  const r = await axios.get(OAUTH_CONSUMER_URL, { timeout: 10000 })
  return { key: r.data.consumer_key, secret: r.data.consumer_secret }
}

function makeOAuth(consumer) {
  return new OAuth({
    consumer,
    signature_method: 'HMAC-SHA1',
    hash_function: (b, k) => crypto.createHmac('sha1', k).update(b).digest('base64'),
  })
}

// ── Cookie jar ────────────────────────────────────────────────────────────────
function makeCookieJar(initial = {}) {
  const jar = { ...initial }
  return {
    extract(resp) {
      for (const c of resp.headers['set-cookie'] || []) {
        const [pair] = c.split(';')
        const idx = pair.indexOf('=')
        if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
      }
    },
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
    toJSON: () => ({ ...jar }),
  }
}

// ── Login params communes ─────────────────────────────────────────────────────
function loginParams() {
  return {
    clientId: CLIENT_ID,
    locale: 'en-US',
    service: SERVICE_URL,
  }
}

// ── Helper sleep ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Réaliser le flow login complet (JSON mobile API) ────────────────────────
async function doLogin(username, password, mfaCode, savedState) {
  const jar = makeCookieJar(savedState?.cookies)
  const client = axios.create({ maxRedirects: 10, timeout: 15000 })
  const params = loginParams()

  // ── Étape MFA : soumettre le code ─────────────────────────────────────────
  if (mfaCode && savedState) {
    const mfaMethod = savedState.mfaMethod ?? 'email'
    let mfaResp
    try {
      mfaResp = await client.post(
        `${SSO_BASE}/mobile/api/mfa/verifyCode`,
        {
          mfaMethod: mfaMethod,
          mfaVerificationCode: mfaCode.trim(),
          rememberMyBrowser: false,
          reconsentList: [],
          mfaSetup: false,
        },
        {
          params,
          headers: { ...SSO_PAGE_HEADERS, Cookie: jar.header() },
          validateStatus: () => true,
        },
      )
    } catch (e) {
      return { error: `Erreur réseau MFA: ${e.message}` }
    }

    // Retry MFA sur 429
    if (mfaResp.status === 429) {
      return { error: 'rate_limited', retryable: true }
    }

    jar.extract(mfaResp)
    const body = mfaResp.data
    const respType = body?.responseStatus?.type
    const respMsg  = body?.responseStatus?.message ?? ''

    if (respType === 'SUCCESSFUL' && body.serviceTicketId) {
      return { ticket: body.serviceTicketId, cookies: jar.toJSON() }
    }

    return {
      error: `MFA échoué: ${respType ?? mfaResp.status} — ${respMsg}`,
      debug: JSON.stringify(body).slice(0, 500),
    }
  }

  // ── Étape 1 : set cookies (bootstrap SSO) ────────────────────────────────
  try {
    const sA = await client.get(
      `${SSO_BASE}/mobile/sso/en/sign-in`,
      {
        params: { clientId: CLIENT_ID },
        headers: { ...SSO_PAGE_HEADERS, 'Sec-Fetch-Site': 'none' },
      },
    )
    jar.extract(sA)
  } catch (_) {
    // Best-effort cookie setup
  }

  // ── Étape 2 : soumettre email + password (JSON API) ──────────────────────
  // Retry automatique sur 429 avec backoff exponentiel (3s, 6s, 12s)
  let loginResp
  const MAX_LOGIN_RETRIES = 3
  for (let attempt = 0; attempt <= MAX_LOGIN_RETRIES; attempt++) {
    try {
      loginResp = await client.post(
        `${SSO_BASE}/mobile/api/login`,
        {
          username,
          password,
          rememberMe: false,
          captchaToken: '',
        },
        {
          params,
          headers: { ...SSO_PAGE_HEADERS, Cookie: jar.header() },
          validateStatus: () => true,
        },
      )
    } catch (e) {
      return {
        error: `Erreur réseau login: ${e.message}`,
        debug: `URL: ${SSO_BASE}/mobile/api/login`,
      }
    }

    if (loginResp.status !== 429) break

    // 429 rate-limited — retry avec backoff
    if (attempt < MAX_LOGIN_RETRIES) {
      const wait = Math.pow(2, attempt) * 3000 // 3s, 6s, 12s
      await sleep(wait)
    }
  }

  // Si toujours 429 après tous les retries
  if (loginResp.status === 429) {
    return { error: 'rate_limited', retryable: true }
  }

  jar.extract(loginResp)
  const body = loginResp.data
  const respType = body?.responseStatus?.type
  const respMsg  = body?.responseStatus?.message ?? ''

  // Succès direct → ticket
  if (respType === 'SUCCESSFUL' && body.serviceTicketId) {
    return { ticket: body.serviceTicketId, cookies: jar.toJSON() }
  }

  // MFA requis
  if (respType === 'MFA_REQUIRED') {
    const mfaInfo   = body.customerMfaInfo ?? {}
    const mfaMethod = mfaInfo.mfaLastMethodUsed ?? 'email'
    return {
      mfa_required: true,
      cookies: jar.toJSON(),
      mfaMethod,
    }
  }

  // Erreurs connues
  if (respMsg.toLowerCase().includes('locked')) {
    return { error: 'Compte Garmin bloqué — déverrouillez-le sur connect.garmin.com' }
  }
  if (respMsg.toLowerCase().includes('password') || respMsg.toLowerCase().includes('credentials')) {
    return { error: 'Email ou mot de passe incorrect' }
  }

  return {
    error: `Réponse Garmin inattendue: ${respType ?? loginResp.status}`,
    debug: `Message: ${respMsg} | Body: ${JSON.stringify(body).slice(0, 500)}`,
  }
}

// ── Obtenir OAuth1 token via ticket ───────────────────────────────────────────
async function getOauth1Token(ticket, consumer, cookieJar) {
  const oauth = makeOAuth(consumer)
  const baseUrl = `${OAUTH_BASE}/preauthorized`
  const queryParams = {
    ticket,
    'login-url': SERVICE_URL,
    'accepts-mfa-tokens': 'true',
  }

  // OAuth 1.0a signe les params de la query string
  const authData = oauth.authorize({
    url: baseUrl,
    method: 'GET',
    data: queryParams,
  })
  const headers = oauth.toHeader(authData)
  const fullUrl = `${baseUrl}?${qs.stringify(queryParams)}`

  const r = await axios.get(fullUrl, {
    headers: {
      ...headers,
      'User-Agent': UA_MOBILE,
      ...(cookieJar ? { Cookie: cookieJar.header() } : {}),
    },
    timeout: 10000,
  })
  return qs.parse(r.data)
}

// ── Échanger OAuth1 → OAuth2 ─────────────────────────────────────────────────
async function exchangeForOauth2(oauth1Token, consumer) {
  const oauth = makeOAuth(consumer)
  const token = { key: oauth1Token.oauth_token, secret: oauth1Token.oauth_token_secret }
  const baseUrl = `${OAUTH_BASE}/exchange/user/2.0`

  const bodyData = { audience: 'GARMIN_CONNECT_MOBILE_ANDROID_DI' }
  if (oauth1Token.mfa_token) {
    bodyData.mfa_token = oauth1Token.mfa_token
  }

  const authData = oauth.authorize({ url: baseUrl, method: 'POST', data: bodyData }, token)
  const headers = oauth.toHeader(authData)

  const r = await axios.post(baseUrl, qs.stringify(bodyData), {
    headers: {
      ...headers,
      'User-Agent': UA_MOBILE,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 10000,
  })
  return r.data
}

// ── Cloudflare cookie (best-effort) ──────────────────────────────────────────
async function setCloudfareCookie(cookieJar) {
  try {
    await axios.get(`${SSO_BASE}/portal/sso/embed`, {
      headers: {
        ...SSO_PAGE_HEADERS,
        'Sec-Fetch-Site': 'same-origin',
        Cookie: cookieJar.header(),
      },
      maxRedirects: 5,
      timeout: 8000,
      validateStatus: () => true,
    })
  } catch (_) {
    // Best-effort
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { username, password, mfaCode, state } = req.body ?? {}
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' })

  try {
    const result = await doLogin(username, password, mfaCode, state)

    // Erreur métier
    if (result.error) {
      if (result.retryable) {
        return res.status(429).json({
          error: 'Garmin limite les connexions — réessayez dans 1-2 minutes',
        })
      }
      return res.status(result.error.includes('incorrect') || result.error.includes('bloqué') ? 401 : 500)
        .json({ error: result.error, ...(result.debug ? { debug: result.debug } : {}) })
    }

    // MFA requis
    if (result.mfa_required) {
      return res.status(200).json({
        mfa_required: true,
        state: {
          cookies: result.cookies,
          mfaMethod: result.mfaMethod,
        },
      })
    }

    // Succès → échanger le ticket contre des tokens OAuth
    const cookieJar = makeCookieJar(result.cookies ?? {})

    // Set Cloudflare LB cookie avant l'échange (comme garth)
    await setCloudfareCookie(cookieJar)

    const consumer = await getOauthConsumer()
    const oauth1Token = await getOauth1Token(result.ticket, consumer, cookieJar)
    const oauth2Token = await exchangeForOauth2(oauth1Token, consumer)

    // Profil utilisateur
    let profile = null
    try {
      const p = await axios.get('https://connect.garmin.com/userprofile-service/socialProfile', {
        headers: { Authorization: `Bearer ${oauth2Token.access_token}` },
        timeout: 8000,
      })
      profile = p.data
    } catch (_) {}

    return res.status(200).json({
      oauth1Token,
      oauth2Token,
      displayName: profile?.displayName ?? profile?.userName ?? username,
      profileImageUrl: profile?.profileImageUrlLarge ?? profile?.profileImageUrl ?? null,
    })

  } catch (err) {
    const status = err?.response?.status
    const url = err?.config?.url ?? 'inconnue'
    const data = err?.response?.data
    return res.status(500).json({
      error: `Erreur ${status ?? ''}: ${err?.message ?? 'inconnue'}`,
      debug: `URL: ${url} | ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data ?? {}).slice(0, 300)}`,
    })
  }
}
