// api/garmin/login.js
// Flow Garmin Connect OAuth — compatible 2025/2026
// Basé sur le flow documenté par garth (https://github.com/matin/garth)
// Utilise l'API JSON de Garmin SSO (plus de scraping HTML)

import axios from 'axios'
import qs from 'qs'
import crypto from 'crypto'
import OAuth from 'oauth-1.0a'

// ── URLs ──────────────────────────────────────────────────────────────────────
const GARMIN_SSO          = 'https://sso.garmin.com/sso'
const SIGNIN_URL          = `${GARMIN_SSO}/signin`
const VERIFY_MFA_URL      = `${GARMIN_SSO}/verifyMFA/loginEnterMfaCode`
const GARMIN_SSO_EMBED    = `${GARMIN_SSO}/embed`
const GC_MODERN           = 'https://connect.garmin.com/modern'
const OAUTH_URL           = 'https://connectapi.garmin.com/oauth-service/oauth'
const OAUTH_CONSUMER_URL  = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'
const UA_BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const UA_MOBILE  = 'com.garmin.android.apps.connectmobile'

// ── Regex ─────────────────────────────────────────────────────────────────────
const CSRF_RE       = /name="_csrf"\s+value="(.+?)"/
const TICKET_RE     = /ticket=([^"&\s<]+)/
const MFA_RE        = /name="mfa-code"|id="mfa-code"|enterMFACode|verificationCode|name="verificationCode"/i
const MFA_ACTION_RE = /action="([^"]*(?:mfa|signin|verifyMFA|verification)[^"]*)"/i
const MFA_FIELD_RE  = /name="(mfa-code|verificationCode|verification-code)"/i
const TITLE_RE      = /<title>([^<]*)<\/title>/i

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

async function getOauth1Token(ticket, consumer) {
  const oauth = makeOAuth(consumer)
  const baseUrl = `${OAUTH_URL}/preauthorized`
  const params = { ticket, 'login-url': GARMIN_SSO_EMBED, 'accepts-mfa-tokens': 'true' }
  // OAuth1 signe l'URL de base + les params séparément
  const authData = oauth.authorize({ url: baseUrl, method: 'GET', data: params })
  const headers = oauth.toHeader(authData)
  const fullUrl = `${baseUrl}?${qs.stringify(params)}`
  const r = await axios.get(fullUrl, {
    headers: { ...headers, 'User-Agent': UA_MOBILE },
    timeout: 10000,
  })
  return qs.parse(r.data)
}

async function exchangeForOauth2(oauth1Token, consumer) {
  const oauth = makeOAuth(consumer)
  const token = { key: oauth1Token.oauth_token, secret: oauth1Token.oauth_token_secret }
  const baseUrl = `${OAUTH_URL}/exchange/user/2.0`
  const authData = oauth.authorize({ url: baseUrl, method: 'POST' }, token)
  const headers = oauth.toHeader(authData)
  const r = await axios.post(baseUrl, null, {
    headers: { ...headers, 'User-Agent': UA_MOBILE, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  })
  return r.data
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

// ── Réaliser le flow login complet (étapes 1+2 ou MFA) ───────────────────────
async function doLogin(username, password, mfaCode, savedState) {
  const jar = makeCookieJar(savedState?.cookies)
  const client = axios.create({ maxRedirects: 10, timeout: 15000 })

  const signinQS = qs.stringify({
    id: 'gauth-widget',
    embedWidget: 'true',
    clientId: 'GarminConnect',
    locale: 'en',
    gauthHost: GARMIN_SSO_EMBED,
    service: GC_MODERN,
    source: GARMIN_SSO_EMBED,
    redirectAfterAccountLoginUrl: GC_MODERN,
    redirectAfterAccountCreationUrl: GC_MODERN,
  })
  const signinFull = `${SIGNIN_URL}?${signinQS}`

  // ── Étape MFA : soumettre le code ─────────────────────────────────────────
  if (mfaCode && savedState) {
    // URL de vérification MFA : utiliser l'URL détectée dans le HTML, sinon le endpoint standard Garmin
    const mfaSubmitUrl = savedState.mfaUrl ?? `${VERIFY_MFA_URL}?${signinQS}`
    const mfaFieldName = savedState.mfaFieldName ?? 'verificationCode'

    const params = new URLSearchParams()
    params.append(mfaFieldName, mfaCode.trim())
    params.append('embed', 'true')
    params.append('_csrf', savedState.csrf)
    params.append('fromPage', 'setupEnterMfaCode')

    let mfaResponse
    try {
      mfaResponse = await client.post(mfaSubmitUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA_BROWSER,
          'Cookie': jar.header(),
          'Origin': 'https://sso.garmin.com',
          'Referer': signinFull,
        },
        validateStatus: () => true,
      })
    } catch (e) {
      return {
        error: `Erreur réseau MFA: ${e.message}`,
        debug: `URL: ${mfaSubmitUrl} | cookies: ${jar.header().slice(0, 100)}`,
      }
    }

    jar.extract(mfaResponse)
    const html = typeof mfaResponse.data === 'string' ? mfaResponse.data : JSON.stringify(mfaResponse.data)
    const title = TITLE_RE.exec(html)?.[1] ?? ''

    // Chercher le ticket dans le HTML ou dans l'URL de redirection
    let ticket = TICKET_RE.exec(html)?.[1]
    if (!ticket) {
      const responseUrl = mfaResponse.request?.res?.responseUrl ?? mfaResponse.request?.responseURL ?? ''
      ticket = TICKET_RE.exec(responseUrl)?.[1]
    }

    if (!ticket) {
      return {
        error: `MFA échoué (status ${mfaResponse.status})`,
        debug: `Title: ${title} | Field: ${mfaFieldName} | URL: ${mfaSubmitUrl} | HTML: ${html.slice(0, 800)}`,
      }
    }
    return { ticket }
  }

  // ── Étape 1 : obtenir CSRF ────────────────────────────────────────────────
  // Step A : init SSO
  const sA = await client.get(`${GARMIN_SSO_EMBED}?${qs.stringify({
    clientId: 'GarminConnect', locale: 'en', service: GC_MODERN,
  })}`, { headers: { 'User-Agent': UA_BROWSER } })
  jar.extract(sA)

  // Step B : page signin avec le bon User-Agent mobile (contourne le CAPTCHA)
  const sB = await client.get(signinFull, {
    headers: { 'User-Agent': UA_BROWSER, 'Cookie': jar.header() },
  })
  jar.extract(sB)

  const htmlB = typeof sB.data === 'string' ? sB.data : ''
  const csrf = CSRF_RE.exec(htmlB)?.[1]
  if (!csrf) {
    return {
      error: 'CSRF non trouvé',
      debug: `Status: ${sB.status} | URL: ${signinFull} | HTML: ${htmlB.slice(0, 300)}`,
    }
  }

  // Step C : soumettre email + password
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  params.append('embed', 'true')
  params.append('_csrf', csrf)

  const sC = await client.post(signinFull, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA_BROWSER,
      'Cookie': jar.header(),
      'Origin': 'https://sso.garmin.com',
      'Referer': signinFull,
    },
  })
  jar.extract(sC)
  const html = typeof sC.data === 'string' ? sC.data : JSON.stringify(sC.data)

  // Ticket direct ?
  const ticket = TICKET_RE.exec(html)?.[1]
  if (ticket) return { ticket }

  // Page MFA ?
  const mfaCsrf = CSRF_RE.exec(html)?.[1]
  if (MFA_RE.test(html) && mfaCsrf) {
    // Chercher l'URL d'action du formulaire MFA dans le HTML
    const actionMatch = MFA_ACTION_RE.exec(html)
    const mfaAction = actionMatch?.[1] ?? null
    let mfaUrl
    if (mfaAction) {
      mfaUrl = mfaAction.startsWith('http') ? mfaAction : `https://sso.garmin.com${mfaAction}`
    } else {
      // Fallback : endpoint standard Garmin verifyMFA avec les mêmes query params
      mfaUrl = `${VERIFY_MFA_URL}?${signinQS}`
    }

    // Detecter le nom du champ MFA dans le HTML
    const fieldMatch = MFA_FIELD_RE.exec(html)
    const mfaFieldName = fieldMatch?.[1] ?? 'verificationCode'

    return {
      mfa_required: true,
      csrf: mfaCsrf,
      cookies: jar.toJSON(),
      mfaUrl,
      mfaFieldName,
    }
  }

  // Erreurs connues
  if (html.includes('AccountLocked')) return { error: 'Compte Garmin bloqué — déverrouillez-le sur connect.garmin.com' }
  if (/invalid.{0,30}password|incorrect.{0,30}password|Bad credentials/i.test(html)) return { error: 'Email ou mot de passe incorrect' }

  return {
    error: 'Réponse Garmin inattendue',
    debug: html.slice(0, 500),
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
      return res.status(result.error.includes('incorrect') || result.error.includes('bloqué') ? 401 : 500)
        .json({ error: result.error, ...(result.debug ? { debug: result.debug } : {}) })
    }

    // MFA requis
    if (result.mfa_required) {
      return res.status(200).json({
        mfa_required: true,
        state: {
          csrf: result.csrf,
          cookies: result.cookies,
          mfaUrl: result.mfaUrl,
          mfaFieldName: result.mfaFieldName,
        },
      })
    }

    // Succès → échanger le ticket contre des tokens OAuth
    const consumer = await getOauthConsumer()
    const oauth1Token = await getOauth1Token(result.ticket, consumer)
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
