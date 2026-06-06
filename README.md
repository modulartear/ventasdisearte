# Prospector — DiseArte

Herramienta de prospección de negocios locales sin presencia web, con análisis IA y generación de mensajes de contacto personalizados.

## Stack

- **Frontend**: React 18 + Vite
- **Backend**: Vercel Serverless Functions (Node.js / Edge)
- **Scraping**: Apify — Google Maps Scraper (`compass~crawler-google-places`)
- **IA**: Anthropic Claude (análisis + redacción de mensajes)

## Deploy en Vercel

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "init: prospector disearte"
git remote add origin https://github.com/TU_USUARIO/prospector.git
git push -u origin main
```

### 2. Conectar en Vercel

1. Ir a [vercel.com](https://vercel.com) → **Add New Project**
2. Importar el repo de GitHub
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Hacer click en **Deploy**

### 3. Configurar variables de entorno

En el dashboard de Vercel → Settings → **Environment Variables**, agregar:

| Variable | Valor |
|---|---|
| `APIFY_API_KEY` | `apify_api_xxxxxxxxxx` |
| `ANTHROPIC_API_KEY` | `sk-ant-xxxxxxxxxx` |

Después ir a **Deployments** → redeploy para que tome las variables.

## Desarrollo local

```bash
npm install
npx vercel dev   # corre frontend + serverless functions juntos en localhost:3000
```

> Necesitás tener instalado `vercel` CLI: `npm i -g vercel`  
> Y estar logueado: `vercel login`

Copiá `.env.example` como `.env.local` con tus keys para desarrollo local.

## Estructura

```
├── api/
│   ├── apify.js        # Proxy Apify (Node.js serverless)
│   └── anthropic.js    # Proxy Anthropic (Edge runtime, soporta streaming)
├── src/
│   ├── App.jsx         # Toda la lógica y UI
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## Seguridad

Las API keys **nunca** llegan al browser. El frontend llama a `/api/apify` y `/api/anthropic`, que son funciones serverless que inyectan las keys desde las variables de entorno de Vercel.
