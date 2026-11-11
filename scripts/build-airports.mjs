#!/usr/bin/env node
/**
 * Gera server/flights/data/airports.json — a base geográfica estruturada de aeroportos
 * usada pelo monitoramento de passagens (expansão de localidades, aeroportos próximos,
 * fusos horários). Rode de novo quando quiser atualizar a base:
 *
 *   curl -sSLO https://davidmegginson.github.io/ourairports-data/airports.csv
 *   curl -sSLO https://davidmegginson.github.io/ourairports-data/regions.csv
 *   curl -sSL -o mwgg.json https://raw.githubusercontent.com/mwgg/Airports/master/airports.json
 *   node scripts/build-airports.mjs airports.csv regions.csv mwgg.json
 *
 * Fontes: OurAirports (domínio público) — tipo, coordenadas, país/estado, município,
 * `scheduled_service` (serviço comercial regular conhecido); mwgg/Airports (MIT) — fuso IANA.
 * Só entram aeroportos com código IATA e tipo large/medium/small (sem heliportos/bases).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const [airportsCsv, regionsCsv, mwggJson] = process.argv.slice(2)
if (!airportsCsv || !regionsCsv || !mwggJson) {
  console.error('uso: node scripts/build-airports.mjs airports.csv regions.csv mwgg.json')
  process.exit(1)
}

/** CSV mínimo com aspas (RFC 4180). */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [head, ...body] = rows
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

const tz = new Map()
for (const a of Object.values(JSON.parse(fs.readFileSync(mwggJson, 'utf8')))) {
  if (a.iata && a.tz) tz.set(a.iata, a.tz)
}
const regionNames = new Map(parseCsv(fs.readFileSync(regionsCsv, 'utf8')).map((r) => [r.code, r.name]))

const TYPES = { large_airport: 'L', medium_airport: 'M', small_airport: 'S' }
const out = []
const usedRegions = {}
const seen = new Set()
for (const a of parseCsv(fs.readFileSync(airportsCsv, 'utf8'))) {
  const iata = (a.iata_code || '').trim().toUpperCase()
  const type = TYPES[a.type]
  if (!/^[A-Z]{3}$/.test(iata) || !type || seen.has(iata)) continue
  // pequenos sem serviço regular só poluem as sugestões
  if (type === 'S' && a.scheduled_service !== 'yes') continue
  seen.add(iata)
  const lat = Math.round(Number(a.latitude_deg) * 10000) / 10000
  const lon = Math.round(Number(a.longitude_deg) * 10000) / 10000
  usedRegions[a.iso_region] = regionNames.get(a.iso_region) ?? a.iso_region
  // [iata, nome, cidade, país, estado/região ISO, lat, lon, fuso, tipo, serviço regular 1/0/null]
  out.push([
    iata,
    a.name,
    a.municipality || '',
    a.iso_country,
    a.iso_region,
    lat,
    lon,
    tz.get(iata) ?? '',
    type,
    a.scheduled_service === 'yes' ? 1 : 0
  ])
}
out.sort((x, y) => x[0].localeCompare(y[0]))

const here = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(here, '..', 'server', 'flights', 'data', 'airports.json')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(
  target,
  JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: ['OurAirports (public domain)', 'mwgg/Airports (MIT) — timezones'],
    fields: ['iata', 'name', 'city', 'country', 'region', 'lat', 'lon', 'tz', 'type', 'scheduled'],
    regions: usedRegions,
    airports: out
  })
)
console.log(`${out.length} aeroportos → ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`)
