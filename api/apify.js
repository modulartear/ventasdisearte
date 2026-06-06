// api/apify.js — Vercel Serverless Function
// Proxy seguro para Apify. La API key nunca sale al browser.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'APIFY_API_KEY no configurada en Vercel' })

  const apifyPath = req.query.path
  if (!apifyPath) return res.status(400).json({ error: 'Falta el parámetro path' })

  // Separar el path base de los query params que vengan dentro del path
  // ej: "datasets/abc123/items?clean=true" → path="datasets/abc123/items" + qs="clean=true"
  const [basePath, inlineQuery] = apifyPath.split('?')

  // Armar query string final: token siempre + lo que venga del path
  const qs = new URLSearchParams({ token: apiKey })
  if (inlineQuery) {
    new URLSearchParams(inlineQuery).forEach((v, k) => qs.set(k, v))
  }

  const targetUrl = `https://api.apify.com/v2/${basePath}?${qs.toString()}`

  try {
    const fetchOptions = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    }

    if (req.method === 'POST' && req.body) {
      fetchOptions.body = JSON.stringify(req.body)
    }

    const apifyRes = await fetch(targetUrl, fetchOptions)
    const data = await apifyRes.json()

    return res.status(apifyRes.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: 'Error al contactar Apify', detail: err.message })
  }
}