// Prints lado a lado: skin clássica × nova, em desktop e celular.
//
// Uso: com `npm run dev:web` rodando (ou `npm start`), execute `npm run screenshots`.
//   RICKOS_WEB_URL  URL da web (padrão http://127.0.0.1:5317)
//   PAGES           lista separada por vírgula (padrão abaixo)
// Saída: docs/screenshots/<pagina>-<viewport>-<skin>.png + docs/screenshots/index.html
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE = (process.env.RICKOS_WEB_URL || 'http://127.0.0.1:5317').replace(/\/+$/, '')
const PAGES = (process.env.PAGES || 'home,timeline,todo,inbox,crm,finance-dashboard,estudos,ai-runner,settings').split(',')
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
  { name: 'celular', width: 390, height: 844, scale: 2 }
]
const SKINS = ['classic', 'devlytics']
const OUT = path.resolve('docs/screenshots')

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const shots = []
try {
  for (const vp of VIEWPORTS) {
    for (const skin of SKINS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale })
      const page = await ctx.newPage()
      for (const p of PAGES) {
        await page.goto(`${BASE}/?skin=${skin}&theme=dark#/${p}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(800)
        const file = `${p}-${vp.name}-${skin}.png`
        await page.screenshot({ path: path.join(OUT, file) })
        shots.push({ page: p, viewport: vp.name, skin, file })
        console.log('✓', file)
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

const label = { classic: 'Clássico', devlytics: 'Novo (Devlytics)' }
const rows = []
for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    const cells = SKINS.map((s) => {
      const f = shots.find((x) => x.page === p && x.viewport === vp.name && x.skin === s)
      return f ? `<figure><figcaption>${label[s]}</figcaption><a href="${f.file}"><img src="${f.file}" loading="lazy"></a></figure>` : ''
    }).join('')
    rows.push(`<section class="${vp.name}"><h2>${p} <small>${vp.name}</small></h2><div class="pair">${cells}</div></section>`)
  }
}
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>rickOS: clássico × novo</title>
<style>
body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#111113;color:#e4e4e7}
h1{font-size:20px;margin:0 0 16px}h2{font-size:15px;margin:28px 0 8px}small{color:#71717a;font-weight:400}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.celular .pair{grid-template-columns:repeat(2,minmax(0,390px))}
figure{margin:0}figcaption{font-size:12px;color:#a1a1aa;margin-bottom:6px}
img{width:100%;border:1px solid #27272a;border-radius:6px;display:block}
</style></head><body><h1>rickOS: clássico × novo</h1>${rows.join('\n')}</body></html>\n`
)
console.log(`\n${shots.length} prints em ${OUT} — abra docs/screenshots/index.html`)
