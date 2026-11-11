import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { NormalizedOffer } from '../../../shared/flights'

// Banco isolado: RICKOS_DATA_DIR precisa existir ANTES de carregar os módulos do servidor.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rickos-flights-'))
process.env.RICKOS_DATA_DIR = dir

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let runner: typeof import('../runner')
let providers: typeof import('../providers')
let types: typeof import('../providers/types')
let shared: typeof import('../../../shared/flights')
let views: typeof import('../views')
let evaluate: typeof import('../evaluate')
let planner: typeof import('../planner')

const day = (n: number): string => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)

function mkOffer(from: string, to: string, date: string, minor: number, flight = '1'): NormalizedOffer {
  return {
    provider: 'fake',
    sourceLabel: 'Fake',
    externalId: null,
    slices: [
      {
        from,
        to,
        departLocal: `${date}T08:00`,
        arriveLocal: `${date}T20:00`,
        durationMin: 720,
        stops: 0,
        carriers: ['XX'],
        firstFlightNumber: flight,
        segments: [{ from, to, departLocal: `${date}T08:00`, arriveLocal: `${date}T20:00`, durationMin: 720, marketingCarrier: 'XX', operatingCarrier: 'XX', flightNumber: flight, terminalFrom: null, terminalTo: null, aircraft: null }]
      }
    ],
    price: { amountMinor: minor, currency: 'BRL' },
    baggage: { checked: 1, carryOn: 1, note: null },
    refundable: null,
    selfTransfer: false,
    separateTickets: false,
    deepLink: null,
    linkKind: null,
    verification: 'live',
    observedAt: new Date().toISOString(),
    expiresAt: null
  }
}

/** Provedor de teste injetado no registro: comportamento controlado por `mode`. */
let mode: 'ok' | 'timeout' | 'auth' = 'ok'
let calls = 0
let price = 300000

async function waitRun(monitorId: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (!(await repo.activeRun(monitorId))) return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('execução não terminou')
}

async function newMonitor(patch: Record<string, unknown> = {}): Promise<number> {
  const c = shared.defaultMonitorConfig()
  c.origins.include = [{ kind: 'airport', code: 'BKK', label: 'BKK' }, { kind: 'airport', code: 'SIN', label: 'SIN' }]
  c.destinations.include = [{ kind: 'airport', code: 'SSA', label: 'SSA' }]
  c.dates.windows = [{ mode: 'range', from: day(30), to: day(33) }]
  c.providers = ['fake']
  Object.assign(c, patch)
  return repo.createMonitor('teste', 'active', c, null)
}

before(async () => {
  repo = await import('../repo')
  runner = await import('../runner')
  providers = await import('../providers')
  types = await import('../providers/types')
  shared = await import('../../../shared/flights')
  views = await import('../views')
  evaluate = await import('../evaluate')
  planner = await import('../planner')
  providers.PROVIDERS.push({
    id: 'fake',
    label: 'Fake',
    kind: 'api',
    capabilities: { oneWay: true, roundTrip: true, monthRange: false, multiAirport: false, livePrices: true, baggage: true, segments: true, deepLink: 'none', passengersMix: true, automated: true, dailyQuota: null },
    docs: '',
    notes: [],
    status: async () => ({ configured: true, available: true, reason: null }),
    search: async (q) => {
      calls++
      if (mode === 'timeout') throw new types.ProviderError('timeout', 'Tempo esgotado (teste).')
      if (mode === 'auth') throw new types.ProviderError('auth', 'credencial inválida (teste)')
      return { offers: [mkOffer(q.origin, q.destination, q.departDate, price, `${q.origin}${q.departDate.slice(-2)}`)] }
    }
  })
})

after(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('persistência e histórico', () => {
  it('mescla a mesma oferta, guarda preço anterior e todas as observações', async () => {
    const id = await newMonitor()
    const o = mkOffer('BKK', 'SSA', day(30), 300000)
    const fp = evaluate.fingerprint(o, 'k')
    const [a] = await repo.upsertOffers(id, [{ offer: o, fp }], 'k', null)
    assert.ok(a.isNew)
    const later = { ...o, price: { amountMinor: 280000, currency: 'BRL' }, observedAt: new Date(Date.now() + 1000).toISOString() }
    const [b] = await repo.upsertOffers(id, [{ offer: later, fp }], 'k', null)
    assert.equal(b.id, a.id)
    assert.ok(b.priceChanged && b.prevMinor === 300000)
    const rows = await repo.listOffers(id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].prevPriceMinor, 300000)
    assert.equal((await repo.listObservations(id, '0000')).length, 2)
    // cache (menor confiança) não sobrescreve preço ao vivo recente
    await repo.upsertOffers(id, [{ offer: { ...o, provider: 'travelpayouts', verification: 'cached', price: { amountMinor: 1, currency: 'BRL' }, observedAt: new Date(Date.now() + 2000).toISOString() }, fp }], 'k', null)
    assert.equal((await repo.listOffers(id))[0].priceMinor, 280000)
    assert.deepEqual(JSON.parse((await repo.listOffers(id))[0].sources).sort(), ['fake', 'travelpayouts'])
  })
})

describe('jobs: idempotência, claim e retomada', () => {
  it('plano não duplica tarefas e o claim é exclusivo', async () => {
    const id = await newMonitor()
    const spec = { key: 'fake|BKK|SSA|x', provider: 'fake', stage: 'discovery' as const, origin: 'BKK', destination: 'SSA', departDate: day(30), returnDate: null, priority: 1 }
    assert.equal(await repo.insertTasks(id, [spec, spec]), 1)
    assert.equal(await repo.insertTasks(id, [spec]), 0)
    const [t] = await repo.listTasks(id)
    assert.equal(await repo.claimTask(t.id, 1), true)
    assert.equal(await repo.claimTask(t.id, 2), false)
    await repo.recoverInterrupted()
    assert.equal((await repo.listTasks(id))[0].status, 'pending')
  })
  it('executa, respeita orçamento por execução e continua depois sem repetir', async () => {
    mode = 'ok'
    calls = 0
    const id = await newMonitor()
    const m = (await repo.getMonitor(id))!
    m.config.budget.maxQueriesPerRun = 3
    await repo.updateMonitor(id, { config: m.config })
    const run = await runner.startRun(id, 'manual')
    const again = await runner.startRun(id, 'manual') // idempotente: devolve a mesma
    assert.equal(again.id, run.id)
    await waitRun(id)
    const r1 = (await repo.getRun(run.id))!
    assert.equal(r1.queries, 3)
    assert.equal(r1.status, 'budget')
    assert.equal(calls, 3)
    const doneKeys = new Set((await repo.listTasks(id)).filter((t) => t.status === 'done').map((t) => t.key))
    const r2 = await runner.startRun(id, 'manual')
    await waitRun(id)
    const tasks = await repo.listTasks(id)
    // as já feitas não foram refeitas: cada chave concluída aparece uma vez e há novas concluídas
    assert.ok(tasks.filter((t) => t.status === 'done').length > doneKeys.size)
    assert.equal(new Set(tasks.map((t) => t.key)).size, tasks.length)
    assert.ok((await repo.getRun(r2.id))!.queries <= 3)
  })
  it('cache evita consulta repetida entre monitores', async () => {
    mode = 'ok'
    calls = 0
    const a = await newMonitor()
    await runner.startRun(a, 'manual')
    await waitRun(a)
    const first = calls
    const b = await newMonitor()
    const run = await runner.startRun(b, 'manual')
    await waitRun(b)
    assert.ok(first > 0)
    assert.ok((await repo.getRun(run.id))!.cacheHits > 0)
  })
})

describe('falhas de provedor', () => {
  it('timeout: agenda retry com backoff, sem marcar como concluída', async () => {
    mode = 'timeout'
    price = 310000
    const id = await newMonitor({ dates: { tripType: 'oneway', windows: [{ mode: 'exact', date: day(40) }], returnWindows: [], minStayDays: null, maxStayDays: null } })
    const run = await runner.startRun(id, 'manual')
    await waitRun(id)
    const tasks = await repo.listTasks(id)
    assert.ok(tasks.every((t) => t.status === 'pending' && t.attempts === 1 && t.nextAttemptAt && t.nextAttemptAt > new Date().toISOString()))
    assert.equal((await repo.getRun(run.id))!.status, 'failed')
    assert.ok((await repo.getMonitor(id))!.lastError)
  })
  it('credencial inválida: desliga o provedor na execução (não insiste em cada combinação)', async () => {
    mode = 'auth'
    calls = 0
    const id = await newMonitor({ dates: { tripType: 'oneway', windows: [{ mode: 'exact', date: day(41) }], returnWindows: [], minStayDays: null, maxStayDays: null } })
    const run = await runner.startRun(id, 'manual')
    await waitRun(id)
    assert.ok(calls <= 2, `chamadas: ${calls}`) // até PER_RUN_PARALLEL em voo
    assert.match((await repo.getRun(run.id))!.message ?? '', /credencial/)
  })
  it('fetchJson classifica 429/500/timeout', async () => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/429') {
        res.writeHead(429, { 'retry-after': '7' })
        res.end('{}')
      } else if (req.url === '/500') {
        res.writeHead(500)
        res.end('x')
      } else setTimeout(() => res.end('{}'), 500)
    })
    await new Promise<void>((r) => srv.listen(0, r))
    const port = (srv.address() as { port: number }).port
    const sig = new AbortController().signal
    const kind = async (p: string, t?: number): Promise<[string, number | null]> => {
      try {
        await types.fetchJson(`http://127.0.0.1:${port}${p}`, { timeoutMs: t }, sig)
        return ['ok', null]
      } catch (e) {
        const pe = e as InstanceType<typeof types.ProviderError>
        return [pe.kind, pe.retryAfterMs]
      }
    }
    assert.deepEqual(await kind('/429'), ['rate_limit', 7000])
    assert.equal((await kind('/500'))[0], 'upstream')
    assert.equal((await kind('/slow', 50))[0], 'timeout')
    srv.close()
  })
})

describe('resultados e alertas', () => {
  it('consulta paginada com contagens e alerta sem duplicar', async () => {
    mode = 'ok'
    price = 250000
    // datas novas: as do começo do arquivo já estão no cache com outro preço
    const id = await newMonitor({ dates: { tripType: 'oneway', windows: [{ mode: 'range', from: day(50), to: day(51) }], returnWindows: [], minStayDays: null, maxStayDays: null } })
    const m0 = (await repo.getMonitor(id))!
    m0.config.alerts.priceBelow = { amountMinor: 260000, currency: 'BRL' }
    await repo.updateMonitor(id, { config: m0.config })
    await runner.startRun(id, 'manual')
    await waitRun(id)
    const m = (await repo.getMonitor(id))!
    const page = await views.queryOffers(m, { status: 'eligible', pageSize: 5 })
    assert.ok(page.total > 0 && page.items.length <= 5)
    assert.equal(page.counts.eligible, page.total)
    assert.ok(page.items[0].searchLinks.every((l) => l.label.startsWith('Pesquisar')))
    const alerts1 = await repo.listAlerts(id)
    assert.ok(alerts1.some((a) => a.kind === 'below'))
    assert.equal(await runner.evaluateAlerts(m, null, new Date(0).toISOString()), 0) // já disparados
    const sum = await views.summarize(m, await views.loadFx())
    assert.equal(sum.minPrice?.amountMinor, 250000)
    assert.equal(sum.state, 'active')
    assert.ok(sum.coverage.covered > 0)
    const plan = await views.plan(m)
    assert.equal(plan.coverage.universe, planner.buildUniverse(m.config, new Date().toISOString().slice(0, 10)).size)
  })
})

describe('IA: resposta validada antes de virar configuração', () => {
  it('descarta aeroportos/regiões inventados e não salva nada', async () => {
    const ai = await import('../ai')
    const before = (await repo.listMonitors()).length
    const d = await ai.buildDraft(
      {
        name: 'Volta do Sudeste Asiático',
        origins: [{ kind: 'region', code: 'southeast_asia' }, { kind: 'airport', code: 'QZX' }, { kind: 'country', code: 'XX' }],
        destinations: [{ kind: 'airport', code: 'SSA' }],
        tripType: 'oneway',
        windows: [{ mode: 'range', from: day(30), to: day(45) }],
        checkedBag: 'required',
        forbiddenConnectionCountries: ['US', 'CA', 'usa'],
        groundAlternatives: [{ airport: 'AJU', toCity: 'Salvador' }, { airport: 'ZZZ', toCity: 'Salvador' }],
        explanations: ['x']
      },
      false,
      false
    )
    assert.deepEqual(d.config.origins.include.map((r) => r.code), ['southeast_asia'])
    assert.ok(d.config.destinations.include.some((r) => r.code === 'AJU'))
    assert.deepEqual(d.config.constraints.forbiddenConnectionCountries, ['US', 'CA'])
    assert.equal(d.config.baggage.checked, 'required')
    assert.ok(d.warnings.some((w) => w.includes('airport:QZX')))
    assert.ok(d.warnings.some((w) => w.includes('ZZZ')))
    assert.equal((await repo.listMonitors()).length, before)
  })
})

describe('radar de promoções (RSS)', () => {
  it('lê RSS e casa posts por cidade/país, sem casar genéricos', async () => {
    const promos = await import('../promos')
    const xml = `<?xml version="1.0"?><rss><channel><title>Blog X</title>
      <item><title>Passagens para Bangkok a partir de R$ 3.999 ida e volta</title><link>https://ex.com/a</link><pubDate>${new Date().toUTCString()}</pubDate><description><![CDATA[<p>Saindo de São Paulo &amp; Rio</p>]]></description></item>
      <item><title>Promoção para Salvador e Aracaju a partir de R$ 299</title><link>https://ex.com/b</link><pubDate>${new Date().toUTCString()}</pubDate><description>Nordeste</description></item>
      <item><title>Voos baratos pelo Brasil</title><link>https://ex.com/c</link><pubDate>${new Date().toUTCString()}</pubDate><description>Várias cidades</description></item>
      <item><title>Bangkok antigo</title><link>https://ex.com/d</link><pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate></item>
    </channel></rss>`
    const items = promos.parseRss(xml, 'x')
    assert.equal(items.length, 4)
    assert.equal(items[0].source, 'Blog X')
    assert.equal(items[0].summary, 'Saindo de São Paulo & Rio')
    const id = await newMonitor()
    const m = (await repo.getMonitor(id))!
    const posts = promos.matchPosts(m, items)
    // internacional: "Salvador e Aracaju" (só lugares do Brasil) não dispara; Bangkok sim
    assert.deepEqual(posts.map((p) => p.link), ['https://ex.com/a'])
    assert.deepEqual(posts[0].prices, ['R$ 3.999'])
    // doméstico: lugares do Brasil contam
    const dom = shared.defaultMonitorConfig()
    dom.origins.include = [{ kind: 'airport', code: 'GRU', label: 'GRU' }]
    dom.destinations.include = [{ kind: 'airport', code: 'SSA', label: 'SSA' }]
    const posts2 = promos.matchPosts({ ...m, config: dom }, items)
    assert.ok(posts2.some((p) => p.link.endsWith('/b')))
  })
})

describe('Skyscanner via Chrome', () => {
  it('monta URL de pesquisa e converte o JSON do Claude validando aeroportos', async () => {
    const sky = await import('../assisted')
    const id = await newMonitor()
    const m = (await repo.getMonitor(id))!
    const url = sky.skyscannerUrl('BKK', 'SSA', '2026-12-12', null, m)
    assert.match(url, /^https:\/\/www\.skyscanner\.com\.br\/transporte\/passagens-aereas\/bkk\/ssa\/261212\/\?/)
    const combo = { origin: 'BKK', destination: 'SSA', depart: '2026-12-12', ret: null, url }
    const r = sky.toOffers(
      combo,
      [
        { depart: '2026-12-12T08:05', arrive: '2026-12-13T06:40', price: 3999.9, currency: 'BRL', stops: 2, via: ['DOH', 'gru'], carrier: 'Qatar Airways', self_transfer: false, checked_bags: null },
        { depart: '2026-12-12T09:00', arrive: '2026-12-13T07:00', price: 'abc', currency: 'BRL', stops: 1 }
      ],
      new Date().toISOString()
    )
    assert.equal(r.offers.length, 1)
    assert.equal(r.errors.length, 1)
    const o = r.offers[0]
    assert.equal(o.provider, 'skyscanner_chrome')
    assert.equal(o.verification, 'assisted')
    assert.deepEqual(o.slices[0].via, ['DOH', 'GRU'])
    assert.equal(o.linkKind, 'search')
    assert.equal(o.price.amountMinor, 399990)
    const prompt = sky.buildPrompt(m, [combo])
    assert.match(prompt, /NÃO tente resolver nem contornar/)
    assert.match(prompt, /NÃO tire screenshots/)
    const combos = await sky.pickCombos(m, 3)
    assert.equal(combos.length, 3)
    assert.equal(new Set(combos.map((c) => c.url)).size, 3)
    assert.ok(new Set(combos.map((c) => c.origin + c.destination)).size >= 2, 'combinações devem variar de par')
    // sugestões variam a data (antes a 1ª rodada repetia a mesma data em todos os pares)
    const pv = await sky.buildPreview(m, 8)
    assert.ok(new Set(pv.recommended.map((c) => c.depart)).size >= Math.min(4, pv.datesTotal), 'sugestões devem variar de data')
    assert.equal(pv.dates.length, Math.min(pv.datesTotal, 240))
    assert.ok(pv.origins.every((o) => o.label.length > 0))
    // escolha manual: aceita combinações do universo, rejeita o resto e remonta a URL no servidor
    const d0 = pv.dates[pv.dates.length - 1]
    const [o0, t0] = pv.pairs[0].split('|')
    const ok = sky.validatePicks(m, [{ origin: o0, destination: t0, depart: d0.depart, ret: d0.ret, url: 'https://evil.example' }, { origin: 'XXX', destination: t0, depart: d0.depart, ret: d0.ret }])
    assert.equal(ok.length, 1)
    assert.match(ok[0].url, /^https:\/\/www\.skyscanner\.com\.br\//)
    assert.throws(() => sky.validatePicks(m, [{ origin: o0, destination: t0, depart: '2001-01-01', ret: null }]))
    assert.deepEqual(sky.spreadOrder(5), [0, 4, 2, 1, 3])
  })

  it('mesmo voo duas vezes na mesma leitura fica com o menor preço; voos sem nº com chegadas diferentes não se fundem', async () => {
    const sky = await import('../assisted')
    const id = await newMonitor()
    const m = (await repo.getMonitor(id))!
    const pk = planner.paxKey(m.config)
    const at = new Date().toISOString()
    const combo = { origin: 'BKK', destination: 'SSA', depart: day(30), ret: null, url: 'https://www.skyscanner.com.br/x' }
    const row = (price: number, arrive: string): Record<string, unknown> => ({ depart: `${day(30)}T18:00`, arrive: `${day(31)}T${arrive}`, price, currency: 'BRL', stops: 1, carrier: 'Qatar Airways' })
    const r = sky.toOffers(combo, [row(4782, '06:00'), row(4159, '06:00'), row(3900, '09:30')], at)
    await repo.upsertOffers(id, r.offers.map((o) => ({ offer: o, fp: evaluate.fingerprint(o, pk) })), pk, null)
    const offers = (await repo.listOffers(id)).sort((a, b) => a.priceMinor - b.priceMinor)
    assert.deepEqual(offers.map((o) => o.priceMinor), [390000, 415900])
    assert.equal(offers[1].prevPriceMinor, null, 'mesma leitura não é mudança de preço')
    const obs = await repo.listObservations(id, '2000-01-01')
    assert.deepEqual(obs.map((o) => o.priceMinor).sort(), [390000, 415900])
  })

  it('linhas RESULT no streaming: extrai só as completas e válidas', async () => {
    const sky = await import('../assisted')
    const r = sky.takeResultLines('blá\nRESULT {"combo":0,"status":"ok","offers":[]}\nRESULT {quebrado}\nRESULT {"combo":1')
    assert.deepEqual(r.results.map((x) => x.combo), [0])
    assert.equal(r.rest, 'RESULT {"combo":1')
  })

  it('grava cada combinação ao vivo, antes de a sessão terminar (claude falso)', async () => {
    const sky = await import('../assisted')
    const q = await import('../../database/queries')
    const id = await newMonitor()
    const m = (await repo.getMonitor(id))!
    const pv = await sky.buildPreview(m, 3)
    const picks = pv.recommended.slice(0, 3)
    const offer = (h: string): string => JSON.stringify({ depart: `${picks[0].depart}T${h}`, arrive: `${picks[0].depart}T23:00`, price: 3999.9, currency: 'BRL', stops: 1, via: ['DOH'], carrier: 'QR' })
    const ev = (text: string): string => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } })
    const final = JSON.stringify({ status: 'ok', results: [{ combo: 2, status: 'empty', offers: [] }] })
    const o1 = offer('09:00')
    // combo 1 chega quebrada em dois pedaços do streaming; combo 2 só no JSON final
    const script = [
      ev(`Abrindo…\nRESULT {"combo":0,"status":"ok","offers":[${offer('08:00')}]}\n`),
      2500,
      ev(`RESULT {"combo":1,"status":"ok","offers":[${o1.slice(0, 20)}`),
      ev(`${o1.slice(20)}]}\n`),
      700,
      JSON.stringify({ type: 'result', result: final, usage: {} })
    ]
    fs.writeFileSync(path.join(dir, 'fake-script.json'), JSON.stringify(script))
    const fake = path.join(dir, 'fake-claude.mjs')
    fs.writeFileSync(
      fake,
      `#!/usr/bin/env node
import fs from 'node:fs'
for (const step of JSON.parse(fs.readFileSync(${JSON.stringify(path.join(dir, 'fake-script.json'))}, 'utf8'))) {
  if (typeof step === 'number') await new Promise((r) => setTimeout(r, step))
  else process.stdout.write(step + '\\n')
}
`
    )
    fs.chmodSync(fake, 0o755)
    await q.setSetting('claude_command', fake)
    await q.setSetting('flights_chrome_assisted', '1')
    const { runId } = await sky.startSkyscanner(id, picks)
    const doneNow = async (): Promise<number> => (await repo.listTasks(id)).filter((t) => t.provider === 'skyscanner_chrome' && t.status === 'done').length
    for (let i = 0; i < 60 && (await doneNow()) === 0; i++) await new Promise((r) => setTimeout(r, 50))
    const mid = { length: await doneNow() }
    assert.equal(mid.length, 1, 'a 1ª combinação deve estar gravada enquanto a sessão ainda roda')
    assert.ok(sky.assistedBusy(), 'a sessão ainda está rodando')
    for (let i = 0; i < 100 && sky.assistedBusy(); i++) await new Promise((r) => setTimeout(r, 100))
    const run = (await repo.listRuns(id)).find((r) => r.id === runId)!
    assert.equal(run.status, 'done', run.message ?? '')
    assert.equal(run.done, 3)
    assert.equal(run.offersFound, 2)
    // o que foi pesquisado passa a ser acompanhado, com o preço do dia
    const tv = await sky.trackedView((await repo.getMonitor(id))!)
    assert.equal(tv.combos.length, 3)
    const c0 = tv.combos.find((c) => c.origin === picks[0].origin && c.depart === picks[0].depart && c.destination === picks[0].destination)!
    assert.equal(c0.latest?.amountMinor, 399990)
    assert.equal(c0.points.length, 1)
    assert.ok(c0.lastCheckedAt)
    assert.ok(c0.originLabel.includes(`(${picks[0].origin})`))
    assert.equal(tv.combos[0].latest?.amountMinor, 399990, 'com preço vem antes de sem preço')
    const pv2 = await sky.buildPreview((await repo.getMonitor(id))!, 3)
    assert.equal(pv2.tracked.length, 3)
    await repo.removeTracked(id, picks[2])
    assert.equal((await sky.trackedView((await repo.getMonitor(id))!)).combos.length, 2)
  })
})
