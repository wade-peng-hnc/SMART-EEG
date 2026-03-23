import crypto from 'node:crypto'
import express from 'express'

const app = express()

const PORT = Number(process.env.SMART_PROXY_PORT || 8787)
const BASE_URL = process.env.SMART_PROXY_BASE_URL || `http://localhost:${PORT}`
const FRONTEND_REDIRECT_URI =
  process.env.SMART_FRONTEND_REDIRECT_URI || 'http://localhost:5173/'
const CLIENT_ID = process.env.SMART_CLIENT_ID || ''
const CLIENT_SECRET = process.env.SMART_CLIENT_SECRET || ''
const SCOPE =
  process.env.SMART_SCOPE || 'launch openid fhirUser profile patient/*.read'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SMART_CLIENT_ID or SMART_CLIENT_SECRET in environment.')
  process.exit(1)
}

const pendingAuth = new Map()
const smartSessions = new Map()

function randomString(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function sha256Base64Url(input) {
  return crypto.createHash('sha256').update(input).digest('base64url')
}

function cleanIssuer(iss) {
  return String(iss || '').replace(/\/+$/, '')
}

async function fetchSmartConfiguration(iss) {
  const wellKnownUrl = `${cleanIssuer(iss)}/.well-known/smart-configuration`
  const res = await fetch(wellKnownUrl)
  if (!res.ok) {
    throw new Error(`Cannot load SMART configuration (${res.status})`)
  }
  return res.json()
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

app.get('/smart/launch', async (req, res) => {
  try {
    const iss = req.query.iss
    const launch = req.query.launch
    if (!iss) {
      return res.status(400).json({ error: 'Missing iss query parameter' })
    }

    const smartConfig = await fetchSmartConfiguration(iss)
    const authEndpoint = smartConfig.authorization_endpoint
    if (!authEndpoint) {
      return res.status(400).json({ error: 'Missing authorization_endpoint' })
    }

    const state = randomString(24)
    const codeVerifier = randomString(48)
    const codeChallenge = sha256Base64Url(codeVerifier)

    pendingAuth.set(state, {
      iss: cleanIssuer(iss),
      launch: launch || '',
      codeVerifier,
      createdAt: Date.now(),
    })

    const redirectUri = `${BASE_URL}/smart/callback`
    const authUrl = new URL(authEndpoint)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', SCOPE)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('aud', cleanIssuer(iss))
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    if (launch) authUrl.searchParams.set('launch', String(launch))

    return res.redirect(authUrl.toString())
  } catch (err) {
    return res.status(500).json({
      error: 'Launch failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
})

app.get('/smart/callback', async (req, res) => {
  try {
    const code = req.query.code
    const state = req.query.state
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' })
    }

    const tx = pendingAuth.get(String(state))
    if (!tx) {
      return res.status(400).json({ error: 'Unknown or expired state' })
    }
    pendingAuth.delete(String(state))

    const smartConfig = await fetchSmartConfiguration(tx.iss)
    const tokenEndpoint = smartConfig.token_endpoint
    if (!tokenEndpoint) {
      return res.status(400).json({ error: 'Missing token_endpoint' })
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: `${BASE_URL}/smart/callback`,
      client_id: CLIENT_ID,
      code_verifier: tx.codeVerifier,
    })

    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    })
    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
      return res.status(502).json({
        error: 'Token exchange failed',
        status: tokenRes.status,
        response: tokenJson,
      })
    }

    const sessionId = randomString(24)
    smartSessions.set(sessionId, {
      serverUrl: tx.iss,
      tokenResponse: tokenJson,
      createdAt: Date.now(),
    })

    const front = new URL(FRONTEND_REDIRECT_URI)
    front.searchParams.set('smartSession', sessionId)
    return res.redirect(front.toString())
  } catch (err) {
    return res.status(500).json({
      error: 'Callback failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
})

app.get('/smart/session/:id', (req, res) => {
  const id = req.params.id
  const data = smartSessions.get(id)
  if (!data) {
    return res.status(404).json({ error: 'Session not found' })
  }
  // One-time fetch to reduce token exposure.
  smartSessions.delete(id)
  return res.json({
    serverUrl: data.serverUrl,
    tokenResponse: data.tokenResponse,
  })
})

setInterval(() => {
  const now = Date.now()
  for (const [state, value] of pendingAuth.entries()) {
    if (now - value.createdAt > 15 * 60 * 1000) pendingAuth.delete(state)
  }
  for (const [id, value] of smartSessions.entries()) {
    if (now - value.createdAt > 10 * 60 * 1000) smartSessions.delete(id)
  }
}, 60 * 1000)

app.listen(PORT, () => {
  console.log(`SMART proxy running on ${BASE_URL}`)
})
