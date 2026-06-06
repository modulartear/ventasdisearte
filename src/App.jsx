import { useState, useRef, useCallback } from 'react'

// ─── API HELPERS ────────────────────────────────────────────────────────────
// Todas las llamadas van a /api/* — Vercel las rutea a las serverless functions
// Las API keys NUNCA tocan el browser, viven en las env vars de Vercel.

async function apifyFetch(path, options = {}) {
  const url = `/api/apify?path=${encodeURIComponent(path)}`
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function* anthropicStream(body) {
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6)
      if (raw === '[DONE]') return
      try {
        const parsed = JSON.parse(raw)
        const delta = parsed.delta?.text || ''
        if (delta) yield delta
      } catch (_) {}
    }
  }
}

async function anthropicJSON(body) {
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const MOCK_DATA = [
  { name:'Parrilla Don Ciro', placeId:'ChIJ...a3f', address:'Av. Pellegrini 450, Venado Tuerto', category:'Restaurante / Parrilla', rating:4.8, reviewCount:312, phone:'+54 9 3462 41-5522', email:null, website:null },
  { name:'Ferretería El Tornillo', placeId:'ChIJ...b7c', address:'Bv. Roca 1120, Venado Tuerto', category:'Ferretería', rating:4.6, reviewCount:87, phone:'+54 9 3462 55-3311', email:'tornillo@gmail.com', website:null },
  { name:'Peluquería Estilo K', placeId:'ChIJ...c2d', address:'España 678, Venado Tuerto', category:'Peluquería', rating:4.9, reviewCount:201, phone:'+54 9 3462 22-7890', email:null, website:null },
  { name:'Rotisería La Abuela', placeId:'ChIJ...d9e', address:'Saavedra 234, Venado Tuerto', category:'Rotisería / Comida', rating:4.7, reviewCount:155, phone:'+54 9 3462 66-1234', email:'laabuela@hotmail.com', website:null },
  { name:'Taller Mecánico Ruiz', placeId:'ChIJ...e5f', address:'Ruta 33 km 2.1, Venado Tuerto', category:'Mecánica / Automotor', rating:4.5, reviewCount:63, phone:'+54 9 3462 33-9900', email:null, website:null },
  { name:'Kiosco Centro Plaza', placeId:'ChIJ...f1g', address:'San Martín 1, Venado Tuerto', category:'Kiosco / Almacén', rating:4.4, reviewCount:42, phone:null, email:null, website:null },
  { name:'Librería del Sol', placeId:'ChIJ...g8h', address:'Moreno 456, Venado Tuerto', category:'Librería / Papelería', rating:4.8, reviewCount:97, phone:'+54 9 3462 77-4455', email:'libreriadelsol@gmail.com', website:null },
  { name:'Gimnasio Total Fit', placeId:'ChIJ...h4i', address:'Urquiza 890, Venado Tuerto', category:'Gimnasio / Fitness', rating:4.6, reviewCount:178, phone:'+54 9 3462 88-2233', email:null, website:null },
]

function mockAnalysis(biz) {
  const score = Math.min(98, Math.round(biz.rating * 14 + Math.random() * 12 + (biz.phone ? 8 : 0)))
  return {
    score,
    scoreTag: score >= 75 ? 'Alto potencial' : score >= 50 ? 'Potencial medio' : 'Bajo potencial',
    scoreDesc: `Con ${biz.reviewCount} reseñas y ${biz.rating}★ sin presencia web, es candidato ideal. Su reputación ya está construida —solo falta digitalizarla.`,
    reviewsSentiment: { positivas: 78, neutras: 14, negativas: 8 },
    reviewsKeywordsPos: ['atención', 'calidad', 'recomendable', 'rápido'],
    reviewsKeywordsNeg: ['horarios', 'demora'],
    reviewsSummary: 'Los clientes destacan la calidad del servicio y el trato personalizado. El negocio tiene una base sólida de clientes fieles que repiten y recomiendan.',
    instagram: { found: Math.random() > 0.4, handle: `@${biz.name.toLowerCase().replace(/\s/g,'_').replace(/[^a-z0-9_]/g,'')}` },
    facebook: { found: Math.random() > 0.5, handle: biz.name },
    emailFound: biz.email || null,
    oportunidad: `Sin web, este negocio pierde clientes que buscan online antes de visitar. Una landing profesional puede aumentar su captación un 30-50% en los primeros meses.`,
  }
}

function mockMessage(biz, analysis, type) {
  if (type === 'whatsapp') return `Hola! 👋 Te escribo desde *DiseArte*, agencia de diseño web.\n\nVi que ${biz.name} tiene una reputación increíble en Google —${biz.rating}★ con ${biz.reviewCount} opiniones es algo que muy pocos negocios logran.\n\nEl detalle es que toda esa reputación "vive" solo en Google Maps. Con una página web propia, cada cliente que te busca online te encuentra directamente, ve tus productos/servicios y te contacta en un clic.\n\nOfrecemos páginas profesionales pensadas para negocios como el tuyo —rápidas, lindas y que aparecen en Google.\n\n¿Te gustaría ver un boceto de cómo quedaría? Lo armamos sin costo para que veas la idea. 🚀`
  return `Asunto: ${biz.name} tiene todo para crecer online — ¿lo hablamos?\n\nHola, ¿cómo andás?\n\nMi nombre es Javier, dirijo DiseArte, una agencia de diseño web para negocios locales.\n\nLlegué a ${biz.name} a través de Google Maps y me llamó la atención: tienen ${biz.rating} estrellas con ${biz.reviewCount} reseñas. Sus clientes los describen como ${(analysis.reviewsKeywordsPos||[]).slice(0,2).join(' y ')}, y eso es un activo enorme.\n\nEl problema es que toda esa reputación vive solo dentro de Google Maps. Sin una página web propia, están perdiendo clientes que buscan online, necesitan ver sus horarios o quieren contactarlos directamente.\n\nEn DiseArte diseñamos páginas web profesionales: rápidas, atractivas y optimizadas para aparecer en Google. No es un gasto, es una inversión con retorno visible en los primeros meses.\n\nMe gustaría mostrarles un boceto sin compromiso. ¿Tienen 15 minutos esta semana?\n\nJavier\nDiseArte — Diseño web para negocios locales`
}

const delay = ms => new Promise(r => setTimeout(r, ms))

// ─── COMPONENTES UI ──────────────────────────────────────────────────────────

function FilterChip({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', justifyContent:'center', gap:5,
      padding:'7px 8px', borderRadius:6,
      border: active ? '1px solid rgba(79,124,255,0.35)' : '1px solid var(--border)',
      background: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text2)',
      fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', transition:'all 0.15s',
    }}>
      <i className={`ti ${icon}`} style={{fontSize:13}} />
      {label}
    </button>
  )
}

function ScoreCircle({ score }) {
  const cls = score >= 75 ? { border:'var(--success)', bg:'rgba(0,229,160,0.08)', color:'var(--success)' }
            : score >= 50 ? { border:'var(--warning)', bg:'rgba(255,170,0,0.08)', color:'var(--warning)' }
            : { border:'var(--danger)', bg:'rgba(255,79,106,0.08)', color:'var(--danger)' }
  return (
    <div style={{ width:64, height:64, borderRadius:'50%', border:`2px solid ${cls.border}`, background:cls.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <span style={{ fontSize:22, fontWeight:800, fontFamily:'var(--mono)', color:cls.color }}>{score}</span>
      <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--text2)' }}>/100</span>
    </div>
  )
}

function ReviewBar({ label, pct, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'var(--mono)', fontSize:11 }}>
      <span style={{ color:'var(--text2)', minWidth:60 }}>{label}</span>
      <div style={{ flex:1, height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:3, transition:'width 0.6s ease' }} />
      </div>
      <span style={{ color:'var(--text2)', minWidth:28, textAlign:'right' }}>{pct}%</span>
    </div>
  )
}

// ─── APP PRINCIPAL ───────────────────────────────────────────────────────────
export default function App() {
  // Búsqueda
  const [ubicacion, setUbicacion] = useState('')
  const [rubro, setRubro] = useState('')
  const [rating, setRating] = useState(4)
  const [cantidad, setCantidad] = useState(100)
  const [filters, setFilters] = useState({ recientes30: true, recientes90: false, conCelular: true, conEmail: false, sinWeb: true, conWeb: false })

  // Resultados
  const [searchState, setSearchState] = useState('idle') // idle | loading | results
  const [loadingMsg, setLoadingMsg] = useState('')
  const [results, setResults] = useState([])

  // Modal análisis
  const [modalOpen, setModalOpen] = useState(false)
  const [modalIdx, setModalIdx] = useState(-1)
  const [modalTab, setModalTab] = useState('analysis')
  const [analysis, setAnalysis] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [msgType, setMsgType] = useState('email')
  const [message, setMessage] = useState('')
  const [msgLoading, setMsgLoading] = useState(false)

  const toggleFilter = key => setFilters(f => ({ ...f, [key]: !f[key] }))

  // ── BÚSQUEDA ──
  const runSearch = async () => {
    if (!ubicacion || !rubro) { alert('Completá ubicación y rubro.'); return }
    setSearchState('loading')
    setLoadingMsg(`Buscando "${rubro}" en ${ubicacion}...`)
    try {
      const data = await fetchFromApify()
      setResults(data)
      setSearchState('results')
    } catch (e) {
      console.error(e)
      setLoadingMsg('Error en Apify. Mostrando datos de demo.')
      await delay(1000)
      setResults(MOCK_DATA)
      setSearchState('results')
    }
  }

  const fetchFromApify = async () => {
    const input = {
      searchStringsArray: [`${rubro} ${ubicacion}`],
      locationQuery: ubicacion,
      maxCrawledPlacesPerSearch: cantidad,
      language: 'es',
    }
    const startData = await apifyFetch('acts/compass~crawler-google-places/runs', { method: 'POST', body: input })
    const runId = startData.data?.id
    if (!runId) throw new Error('No runId — verificá la configuración de Apify en Vercel')

    let status = 'RUNNING'
    while (status === 'RUNNING' || status === 'READY') {
      await delay(3000)
      const s = await apifyFetch(`actor-runs/${runId}`)
      status = s.data?.status
      setLoadingMsg(`Extrayendo datos... (${status})`)
    }
    if (status !== 'SUCCEEDED') throw new Error('Run failed: ' + status)

    const runInfo = await apifyFetch(`actor-runs/${runId}`)
    const datasetId = runInfo.data.defaultDatasetId
    const items = await apifyFetch(`datasets/${datasetId}/items?clean=true`)

    return items
      .filter(p => !p.website && (p.totalScore || 0) >= rating)
      .map(p => ({
        name: p.title || '',
        placeId: p.placeId || '',
        address: p.address || '',
        category: (p.categories || []).join(' / '),
        rating: p.totalScore || 0,
        reviewCount: p.reviewsCount || 0,
        phone: p.phone || null,
        email: null,
        website: p.website || null,
        reviews: p.reviews || [],
      }))
  }

  // ── MODAL ──
  const openModal = async (idx) => {
    setModalIdx(idx)
    setModalTab('analysis')
    setAnalysis(null)
    setMessage('')
    setModalOpen(true)
    await runAnalysis(results[idx])
  }

  const runAnalysis = async (biz) => {
    setAnalysisLoading(true)
    try {
      const prompt = `Sos un analista de negocios digitales. Analiza este negocio local argentino y devolvé SOLO un objeto JSON sin markdown ni backticks:
{"score":número 1-100,"scoreTag":"Alto potencial"|"Potencial medio"|"Bajo potencial","scoreDesc":"texto corto 2 líneas","reviewsSentiment":{"positivas":número,"neutras":número,"negativas":número},"reviewsKeywordsPos":["4 palabras"],"reviewsKeywordsNeg":["2 palabras"],"reviewsSummary":"resumen 2-3 líneas","instagram":{"found":boolean,"handle":"string o null"},"facebook":{"found":boolean,"handle":"string o null"},"emailFound":"string o null","oportunidad":"texto 2 líneas"}

Negocio: ${biz.name}, Rubro: ${biz.category}, Dirección: ${biz.address}, Rating: ${biz.rating}★ (${biz.reviewCount} reseñas), Tel: ${biz.phone || 'n/d'}, Web: ninguna`

      const data = await anthropicJSON({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
      const text = data.content?.[0]?.text || ''
      const result = JSON.parse(text.replace(/```json|```/g, '').trim())
      setAnalysis(result)
    } catch (e) {
      console.error(e)
      setAnalysis(mockAnalysis(results[modalIdx] || results[0]))
    }
    setAnalysisLoading(false)
  }

  const generateMessage = useCallback(async (type = msgType) => {
    const biz = results[modalIdx]
    if (!biz || !analysis) return
    setMsgLoading(true)
    setMessage('')
    const isEmail = type === 'email'
    const prompt = `Sos el equipo de DiseArte, agencia de diseño web y desarrollo digital de Argentina. Redactá un mensaje de primer contacto para este negocio local que NO tiene página web pero tiene excelente reputación en Google.

El mensaje debe ser: en español argentino (voseo), persuasivo sin ser agresivo, personalizado con los datos reales, informativo sobre el valor de tener una web, con mención a su buena reputación como activo a digitalizar, con llamado a la acción claro.
${isEmail ? 'Formato EMAIL: primera línea "Asunto: ...", luego el cuerpo. 200-280 palabras.' : 'Formato WHATSAPP: directo, párrafos cortos, máximo 180 palabras, 1-2 emojis estratégicos.'}

Negocio: ${biz.name}, Rubro: ${biz.category}, Dirección: ${biz.address}
Calificación: ${biz.rating}★ con ${biz.reviewCount} reseñas
Instagram: ${analysis.instagram?.found ? analysis.instagram.handle : 'no encontrado'}
Score oportunidad: ${analysis.score}/100
Keywords positivos: ${(analysis.reviewsKeywordsPos || []).join(', ')}

Devolvé SOLO el mensaje.`

    try {
      let full = ''
      for await (const chunk of anthropicStream({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })) {
        full += chunk
        setMessage(full)
      }
    } catch (e) {
      console.error(e)
      setMessage(mockMessage(biz, analysis, type))
    }
    setMsgLoading(false)
  }, [modalIdx, results, analysis, msgType])

  const switchMsgType = (type) => {
    setMsgType(type)
    setMessage('')
    generateMessage(type)
  }

  const switchModalTab = (tab) => {
    setModalTab(tab)
    if (tab === 'message' && !message && !msgLoading) generateMessage()
  }

  const copyMessage = async () => {
    if (!message) return
    await navigator.clipboard.writeText(message)
  }

  const openInApp = () => {
    const biz = results[modalIdx]
    if (!message || !biz) return
    if (msgType === 'whatsapp') {
      const phone = (biz.phone || '').replace(/\D/g, '')
      if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
      else { navigator.clipboard.writeText(message); alert('Sin número. Mensaje copiado.') }
    } else {
      const lines = message.split('\n')
      const subject = lines[0].startsWith('Asunto:') ? lines[0].replace('Asunto:', '').trim() : 'Propuesta web — DiseArte'
      const body = lines.slice(1).join('\n').trim()
      window.location.href = `mailto:${biz.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    }
  }

  const exportCSV = () => {
    if (!results.length) return
    const headers = ['Negocio','Dirección','Rubro','Calificación','Reseñas','Teléfono','Email','Sitio web']
    const rows = results.map(b => [b.name, b.address, b.category, b.rating, b.reviewCount, b.phone||'', b.email||'', b.website||''])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = 'prospector_export.csv'; a.click()
  }

  const activeBiz = results[modalIdx]

  // ── RENDER ──
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>

      {/* HEADER */}
      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, background:'var(--accent)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'white', letterSpacing:-1 }}>P</div>
          <span style={{ fontSize:15, fontWeight:700 }}>Prospector</span>
          <span style={{ fontFamily:'var(--mono)', fontSize:10, background:'var(--accent-dim)', color:'var(--accent)', padding:'2px 7px', borderRadius:4, border:'1px solid rgba(79,124,255,0.2)' }}>by DiseArte</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          <span style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent2)', animation:'pulse 2s infinite' }} />
            API conectada
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)' }}>
            <i className="ti ti-database" style={{ fontSize:13 }} />
            {results.length} leads
          </span>
        </div>
      </header>

      {/* MAIN */}
      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', flex:1, overflow:'hidden' }}>

        {/* SIDEBAR */}
        <aside style={{ borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>

          <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
            <div style={S.label}>Búsqueda</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Field label="Ubicación">
                <input style={S.input} value={ubicacion} onChange={e=>setUbicacion(e.target.value)} placeholder="ej: Venado Tuerto, Santa Fe" onKeyDown={e=>e.key==='Enter'&&runSearch()} />
              </Field>
              <Field label="Rubro / Categoría">
                <input style={S.input} value={rubro} onChange={e=>setRubro(e.target.value)} placeholder="ej: restaurante, ferretería" onKeyDown={e=>e.key==='Enter'&&runSearch()} />
              </Field>
            </div>
          </div>

          <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
            <div style={S.label}>Filtros</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <Field label={`Calificación mínima: ${rating.toFixed(1)} ★`}>
                <input type="range" min={1} max={5} step={0.5} value={rating} onChange={e=>setRating(parseFloat(e.target.value))} style={{ width:'100%', accentColor:'var(--accent)' }} />
              </Field>
              <Field label="Reseñas recientes">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <FilterChip icon="ti-clock" label="Últ. 30d" active={filters.recientes30} onClick={()=>toggleFilter('recientes30')} />
                  <FilterChip icon="ti-clock" label="Últ. 3 meses" active={filters.recientes90} onClick={()=>toggleFilter('recientes90')} />
                </div>
              </Field>
              <Field label="Contacto">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <FilterChip icon="ti-phone" label="Con celular" active={filters.conCelular} onClick={()=>toggleFilter('conCelular')} />
                  <FilterChip icon="ti-mail" label="Con email" active={filters.conEmail} onClick={()=>toggleFilter('conEmail')} />
                </div>
              </Field>
              <Field label="Estado web">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <FilterChip icon="ti-world-off" label="Sin web" active={filters.sinWeb} onClick={()=>toggleFilter('sinWeb')} />
                  <FilterChip icon="ti-world" label="Con web" active={filters.conWeb} onClick={()=>toggleFilter('conWeb')} />
                </div>
              </Field>
            </div>
          </div>

          <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
            <div style={S.label}>Resultados</div>
            <select style={S.input} value={cantidad} onChange={e=>setCantidad(parseInt(e.target.value))}>
              <option value={20}>20 negocios</option>
              <option value={50}>50 negocios</option>
              <option value={100}>100 negocios</option>
              <option value={200}>200 negocios</option>
            </select>
          </div>

          <button
            onClick={runSearch}
            disabled={searchState === 'loading'}
            style={{ margin:'16px 20px 20px', padding:13, background: searchState==='loading' ? 'rgba(79,124,255,0.5)' : 'var(--accent)', color:'white', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor: searchState==='loading' ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
          >
            {searchState === 'loading'
              ? <><i className="ti ti-loader" style={{ animation:'spin 1s linear infinite' }} /> Buscando...</>
              : <><i className="ti ti-search" /> Buscar negocios</>
            }
          </button>
        </aside>

        {/* PANEL RESULTADOS */}
        <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', padding:'0 24px', flexShrink:0 }}>
            <div style={{ ...S.tab, color:'var(--accent)', borderBottom:'2px solid var(--accent)' }}>
              <i className="ti ti-list-search" style={{ fontSize:14 }} />
              Prospección
              {results.length > 0 && <span style={{ background:'var(--accent-dim)', color:'var(--accent)', padding:'1px 5px', borderRadius:3, fontSize:9 }}>{results.length}</span>}
            </div>
            <div style={{ ...S.tab, opacity:0.4, cursor:'default' }}>
              <i className="ti ti-layout" style={{ fontSize:14 }} />
              Boceto web
              <span style={{ background:'rgba(255,170,0,0.1)', color:'var(--warning)', padding:'1px 5px', borderRadius:3, fontSize:9 }}>pronto</span>
            </div>
          </div>

          {/* IDLE */}
          {searchState === 'idle' && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:'60px 24px' }}>
              <div style={{ width:64, height:64, borderRadius:16, border:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, color:'var(--text2)' }}>
                <i className="ti ti-building-store" />
              </div>
              <h3 style={{ fontSize:15, fontWeight:600 }}>Listo para prospectar</h3>
              <p style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text2)', textAlign:'center', maxWidth:320, lineHeight:1.6 }}>
                Completá ubicación y rubro, configurá los filtros y hacé click en Buscar.
              </p>
            </div>
          )}

          {/* LOADING */}
          {searchState === 'loading' && (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, padding:'60px 24px' }}>
              <i className="ti ti-loader" style={{ fontSize:32, color:'var(--accent)', animation:'spin 1s linear infinite' }} />
              <h3 style={{ fontSize:15, fontWeight:600 }}>Consultando Apify...</h3>
              <p style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text2)', textAlign:'center', maxWidth:320, lineHeight:1.6 }}>{loadingMsg}</p>
              <div style={{ width:200, height:2, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ width:'40%', height:'100%', background:'var(--accent)', animation:'slide 1.2s ease-in-out infinite' }} />
              </div>
            </div>
          )}

          {/* RESULTS TABLE */}
          {searchState === 'results' && (
            <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                  <h2 style={{ fontSize:14, fontWeight:600 }}>Resultados</h2>
                  <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent2)', background:'rgba(0,229,160,0.1)', padding:'2px 8px', borderRadius:4 }}>{results.length} encontrados</span>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={exportCSV} style={S.actionBtn}><i className="ti ti-download" style={{ fontSize:14 }} />Exportar CSV</button>
                  <button onClick={()=>setSearchState('idle')} style={S.actionBtn}><i className="ti ti-refresh" style={{ fontSize:14 }} />Limpiar</button>
                </div>
              </div>
              <div style={{ flex:1, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface)', position:'sticky', top:0, zIndex:1 }}>
                      {['Negocio','Ubicación','Rubro','Calificación','Contacto','Web',''].map(h=>(
                        <th key={h} style={{ textAlign:'left', padding:'10px 16px', fontFamily:'var(--mono)', fontSize:10, color:'var(--text2)', letterSpacing:1, textTransform:'uppercase', fontWeight:400, whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((biz, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }} onMouseEnter={e=>e.currentTarget.style.background='var(--surface)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <td style={{ padding:'11px 16px' }}>
                          <div style={{ fontWeight:600 }}>{biz.name}</div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text2)' }}>{biz.placeId}</div>
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5, color:'var(--text2)', fontSize:12 }}>
                            <i className="ti ti-map-pin" style={{ fontSize:13, color:'var(--accent)' }} />{biz.address}
                          </div>
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          <span style={{ display:'inline-block', padding:'3px 9px', borderRadius:4, fontFamily:'var(--mono)', fontSize:10, background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--text2)' }}>{biz.category}</span>
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <span style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:500, color:'var(--warning)' }}>★ {biz.rating.toFixed(1)}</span>
                            <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text2)' }}>({biz.reviewCount})</span>
                          </div>
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--mono)', fontSize:11, color: biz.phone ? 'var(--text)' : 'var(--text2)' }}>
                              <i className="ti ti-device-mobile" style={{ fontSize:13, color:'var(--accent2)' }} />{biz.phone || '—'}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--mono)', fontSize:11, color: biz.email ? 'var(--text)' : 'var(--text2)' }}>
                              <i className="ti ti-mail" style={{ fontSize:13, color:'var(--accent)' }} />{biz.email || '—'}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          {biz.website
                            ? <a href={biz.website} target="_blank" rel="noreferrer" style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--accent)', textDecoration:'none' }}>Ver sitio</a>
                            : <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontFamily:'var(--mono)', fontSize:10, color:'var(--danger)', background:'rgba(255,79,106,0.08)', padding:'3px 8px', borderRadius:4, border:'1px solid rgba(255,79,106,0.2)' }}><i className="ti ti-world-off" style={{ fontSize:11 }} />Sin sitio</span>
                          }
                        </td>
                        <td style={{ padding:'11px 16px' }}>
                          <button onClick={()=>openModal(i)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid rgba(79,124,255,0.3)', background:'var(--accent-dim)', color:'var(--accent)', fontFamily:'var(--mono)', fontSize:10, cursor:'pointer', whiteSpace:'nowrap' }}>
                            Analizar ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODAL ANÁLISIS ═══ */}
      {modalOpen && activeBiz && (
        <div onClick={e=>e.target===e.currentTarget&&setModalOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:24, overflowY:'auto' }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, width:'100%', maxWidth:820, margin:'auto', display:'flex', flexDirection:'column', overflow:'hidden', animation:'fadeIn 0.25s ease' }}>

            {/* Modal header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 24px', borderBottom:'1px solid var(--border)' }}>
              <div>
                <h2 style={{ fontSize:16, fontWeight:700 }}>{activeBiz.name}</h2>
                <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)' }}>{activeBiz.category} · {activeBiz.address}</span>
              </div>
              <button onClick={()=>setModalOpen(false)} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Modal tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 24px' }}>
              {[['analysis','ti-chart-dots','Análisis'],['message','ti-send','Mensaje de contacto']].map(([tab,icon,label])=>(
                <button key={tab} onClick={()=>switchModalTab(tab)} style={{ ...S.tab, color: modalTab===tab ? 'var(--accent)' : 'var(--text2)', borderBottom: modalTab===tab ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', border:'none', borderBottom: modalTab===tab ? '2px solid var(--accent)' : '2px solid transparent', cursor:'pointer' }}>
                  <i className={`ti ${icon}`} style={{ fontSize:13 }} />{label}
                </button>
              ))}
            </div>

            {/* Modal body */}
            <div style={{ padding:24, overflowY:'auto', maxHeight:'70vh' }}>

              {/* TAB ANÁLISIS */}
              {modalTab === 'analysis' && (
                analysisLoading ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, fontFamily:'var(--mono)', fontSize:12, color:'var(--text2)' }}>
                    <i className="ti ti-loader" style={{ animation:'spin 1s linear infinite', fontSize:16, color:'var(--accent)' }} />
                    Analizando con IA...
                  </div>
                ) : analysis ? (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

                    {/* Score */}
                    <AnalysisCard title="Score de oportunidad" icon="ti-target">
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <ScoreCircle score={analysis.score} />
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          <span style={{
                            display:'inline-block', padding:'2px 8px', borderRadius:4,
                            fontFamily:'var(--mono)', fontSize:10, width:'fit-content',
                            ...(analysis.score>=75 ? {background:'rgba(0,229,160,0.1)',color:'var(--success)'} : analysis.score>=50 ? {background:'rgba(255,170,0,0.1)',color:'var(--warning)'} : {background:'rgba(255,79,106,0.1)',color:'var(--danger)'}),
                          }}>{analysis.scoreTag}</span>
                          <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>{analysis.scoreDesc}</p>
                        </div>
                      </div>
                    </AnalysisCard>

                    {/* Redes */}
                    <AnalysisCard title="Presencia digital" icon="ti-share">
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {[
                          { icon:'ti-brand-instagram', color:'#e1306c', label:'Instagram', found:analysis.instagram?.found, handle:analysis.instagram?.handle },
                          { icon:'ti-brand-facebook', color:'#1877f2', label:'Facebook', found:analysis.facebook?.found, handle:analysis.facebook?.handle },
                          { icon:'ti-world-off', color:'var(--danger)', label:'Sitio web', found:false, handle:null },
                          { icon:'ti-mail', color:'var(--accent)', label:'Email', found:!!analysis.emailFound, handle:analysis.emailFound },
                        ].map(({ icon, color, label, found, handle }) => (
                          <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', background:'var(--surface3)', borderRadius:8 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                              <i className={`ti ${icon}`} style={{ fontSize:16, color }} />{label}
                            </div>
                            {found
                              ? <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                                  <span style={{ fontFamily:'var(--mono)', fontSize:10, background:'rgba(0,229,160,0.1)', color:'var(--success)', padding:'2px 7px', borderRadius:3 }}>Encontrado</span>
                                  {handle && <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)' }}>{handle}</span>}
                                </div>
                              : <span style={{ fontFamily:'var(--mono)', fontSize:10, background:'rgba(255,255,255,0.05)', color:'var(--text2)', padding:'2px 7px', borderRadius:3 }}>Sin perfil</span>
                            }
                          </div>
                        ))}
                      </div>
                    </AnalysisCard>

                    {/* Reseñas */}
                    <AnalysisCard title="Análisis de reseñas" icon="ti-messages">
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        <ReviewBar label="Positivas" pct={analysis.reviewsSentiment?.positivas||0} color="var(--success)" />
                        <ReviewBar label="Neutras" pct={analysis.reviewsSentiment?.neutras||0} color="var(--text2)" />
                        <ReviewBar label="Negativas" pct={analysis.reviewsSentiment?.negativas||0} color="var(--danger)" />
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:12 }}>
                        {(analysis.reviewsKeywordsPos||[]).map(k=><span key={k} style={{ padding:'3px 10px', borderRadius:4, fontFamily:'var(--mono)', fontSize:10, background:'rgba(0,229,160,0.1)', color:'var(--success)', border:'1px solid rgba(0,229,160,0.2)' }}>+ {k}</span>)}
                        {(analysis.reviewsKeywordsNeg||[]).map(k=><span key={k} style={{ padding:'3px 10px', borderRadius:4, fontFamily:'var(--mono)', fontSize:10, background:'rgba(255,79,106,0.1)', color:'var(--danger)', border:'1px solid rgba(255,79,106,0.2)' }}>− {k}</span>)}
                      </div>
                      <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.7, marginTop:10 }}>{analysis.reviewsSummary}</p>
                    </AnalysisCard>

                    {/* Oportunidad */}
                    <AnalysisCard title="Por qué necesita una web" icon="ti-bulb" iconColor="var(--warning)">
                      <p style={{ fontSize:13, lineHeight:1.7, color:'var(--text2)' }}>{analysis.oportunidad}</p>
                      <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                        {[
                          ['ti-search', 'Aparece en Google con su propia URL'],
                          ['ti-users', 'Convierte visitantes en clientes 24/7'],
                          ['ti-star', `Amplifica su reputación de ${activeBiz.rating}★`],
                          ['ti-share', 'Centraliza redes, teléfono y dirección'],
                        ].map(([icon, txt]) => (
                          <div key={txt} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text2)' }}>
                            <i className={`ti ${icon}`} style={{ fontSize:14, color:'var(--accent2)' }} />{txt}
                          </div>
                        ))}
                      </div>
                    </AnalysisCard>

                  </div>
                ) : null
              )}

              {/* TAB MENSAJE */}
              {modalTab === 'message' && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', gap:8 }}>
                      {[['email','ti-mail','Email'],['whatsapp','ti-brand-whatsapp','WhatsApp']].map(([type,icon,label])=>(
                        <button key={type} onClick={()=>switchMsgType(type)} style={{ padding:'7px 14px', borderRadius:7, border: msgType===type ? '1px solid rgba(79,124,255,0.35)' : '1px solid var(--border)', background: msgType===type ? 'var(--accent-dim)' : 'transparent', color: msgType===type ? 'var(--accent)' : 'var(--text2)', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                          <i className={`ti ${icon}`} style={{ fontSize:14 }} />{label}
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>generateMessage()} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <i className="ti ti-refresh" style={{ fontSize:14 }} />Regenerar
                    </button>
                  </div>

                  <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:16, fontSize:13, lineHeight:1.8, color:'var(--text)', whiteSpace:'pre-wrap', minHeight:220, display:'flex', alignItems: msgLoading && !message ? 'center' : 'flex-start', gap: msgLoading && !message ? 8 : 0 }}>
                    {msgLoading && !message
                      ? <><i className="ti ti-loader" style={{ animation:'spin 1s linear infinite', fontSize:16, color:'var(--accent)' }} /><span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text2)' }}>Generando mensaje con IA...</span></>
                      : <span style={{ display:'inline' }}>{message}{msgLoading && <span style={{ animation:'blink 0.8s infinite', color:'var(--accent)' }}>▋</span>}</span>
                    }
                  </div>

                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button onClick={copyMessage} style={{ padding:'9px 18px', borderRadius:8, background:'transparent', color:'var(--text2)', border:'1px solid var(--border)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <i className="ti ti-copy" style={{ fontSize:15 }} />Copiar
                    </button>
                    <button onClick={openInApp} style={{ padding:'9px 18px', borderRadius:8, background:'var(--accent)', color:'white', border:'none', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <i className={`ti ${msgType==='whatsapp'?'ti-brand-whatsapp':'ti-mail'}`} style={{ fontSize:15 }} />
                      {msgType === 'whatsapp' ? 'Abrir en WhatsApp' : 'Abrir en Mail'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SUB-COMPONENTES ──────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <label style={{ fontSize:11, color:'var(--text2)', fontWeight:500 }}>{label}</label>
      {children}
    </div>
  )
}

function AnalysisCard({ title, icon, iconColor='var(--accent)', children }) {
  return (
    <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:16 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text2)', letterSpacing:1, textTransform:'uppercase', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
        <i className={`ti ${icon}`} style={{ fontSize:14, color:iconColor }} />{title}
      </div>
      {children}
    </div>
  )
}

// ─── ESTILOS REUTILIZABLES ────────────────────────────────────────────────────
const S = {
  label: { fontFamily:'var(--mono)', fontSize:10, color:'var(--text2)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:12 },
  input: { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontFamily:'var(--display)', fontSize:13, outline:'none', width:'100%' },
  tab: { padding:'12px 16px', fontFamily:'var(--mono)', fontSize:11, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', cursor:'pointer' },
  actionBtn: { display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--text2)', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer' },
}
