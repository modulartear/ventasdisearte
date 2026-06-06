// api/apify.js — Vercel Serverless Function
// Proxy seguro para Apify. La API key nunca sale al browser.

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()

  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'APIFY_API_KEY no configurada en Vercel' })

  // El path de Apify viene en el query param `path`
  // ej: /api/apify?path=acts/compass~crawler-google-places/runs
  const apifyPath = req.query.path
  if (!apifyPath) return res.status(400).json({ error: 'Falta el parámetro path' })

  // Construir URL destino, inyectando la key desde el servidor
  const targetUrl = `https://api.apify.com/v2/${apifyPath}?token=${apiKey}`

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
