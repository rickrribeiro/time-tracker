import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MonitorConfig, NormalizedOffer, Segment, Slice } from '../../../shared/flights'
import { defaultMonitorConfig } from '../../../shared/flights'
import { datePairs, expandWindows, validateDates } from '../dates'
import { diversify, evaluateOffer, fingerprint, makeFx, scoreAll, sortScored } from '../evaluate'
import { expandRef, expandSet, getAirport, haversineKm, resolveRef, searchPlaces, airportsNear } from '../geo'
import { parseImport } from '../importer'
import { buildUniverse, coverageOf, newSpecs, paxKey, planDeepen, planDiscovery, planValidate } from '../planner'
import { normalizeDuffelOffer } from '../providers/duffel'
import { normalizeTicket } from '../providers/travelpayouts'
import { decimalToMinor, isoDurationMin } from '../providers/types'
import { normalizeConfig } from '../validate'

const TODAY = '2026-11-11'
const fx = makeFx('BRL', { USD: 5.5, EUR: 6 })

function seg(from: string, to: string, dep: string, arr: string, carrier = 'QR', flight = '100'): Segment {
  return { from, to, departLocal: dep, arriveLocal: arr, durationMin: null, marketingCarrier: carrier, operatingCarrier: carrier, flightNumber: flight, terminalFrom: null, terminalTo: null, aircraft: null }
}
function slice(segs: Segment[], extra: Partial<Slice> = {}): Slice {
  return { from: segs[0].from, to: segs[segs.length - 1].to, departLocal: segs[0].departLocal, arriveLocal: segs[segs.length - 1].arriveLocal, durationMin: null, stops: segs.length - 1, carriers: [], firstFlightNumber: null, segments: segs, ...extra }
}
function offer(slices: Slice[], amount = 500000, extra: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    provider: 'duffel',
    sourceLabel: 'test',
    externalId: null,
    slices,
    price: { amountMinor: amount, currency: 'BRL' },
    baggage: { carryOn: 1, checked: 1, note: null },
    refundable: null,
    selfTransfer: false,
    separateTickets: false,
    deepLink: null,
    linkKind: null,
    verification: 'live',
    observedAt: '2026-11-11T10:00:00Z',
    expiresAt: null,
    ...extra
  }
}
function cfg(patch: (c: MonitorConfig) => void = () => undefined): MonitorConfig {
  const c = defaultMonitorConfig()
  c.origins.include = [{ kind: 'airport', code: 'BKK', label: 'BKK' }]
  c.destinations.include = [{ kind: 'airport', code: 'SSA', label: 'SSA' }]
  c.dates.windows = [{ mode: 'range', from: '2026-12-10', to: '2026-12-12' }]
  patch(c)
  return c
}
/** BKK → DOH → GRU → SSA, conexões em DOH e GRU. */
const viaDoha = slice([
  seg('BKK', 'DOH', '2026-12-10T08:00', '2026-12-10T11:30', 'QR', '833'),
  seg('DOH', 'GRU', '2026-12-10T14:00', '2026-12-10T22:30', 'QR', '773'),
  seg('GRU', 'SSA', '2026-12-11T06:00', '2026-12-11T08:30', 'LA', '3000')
])
/** BKK → LAX → GRU → SSA (conexão nos EUA). */
const viaUsa = slice([
  seg('BKK', 'LAX', '2026-12-10T08:00', '2026-12-10T06:00', 'TG', '1'),
  seg('LAX', 'GRU', '2026-12-10T10:00', '2026-12-11T00:30', 'LA', '8000'),
  seg('GRU', 'SSA', '2026-12-11T06:00', '2026-12-11T08:30', 'LA', '3000')
])

describe('geo: expansão e base de aeroportos', () => {
  it('expande país, região, estado e metrópole; respeita exclusões', () => {
    const th = expandRef({ kind: 'country', code: 'TH', label: '' })
    assert.ok(th.some((a) => a.iata === 'BKK') && th.every((a) => a.country === 'TH' && a.scheduled))
    const sea = expandRef({ kind: 'region', code: 'southeast_asia', label: '' })
    for (const c of ['VN', 'TH', 'MY', 'SG', 'LA', 'KH']) assert.ok(sea.some((a) => a.country === c), c)
    const ba = expandRef({ kind: 'state', code: 'BR-BA', label: '' })
    assert.ok(ba.some((a) => a.iata === 'SSA') && ba.every((a) => a.region === 'BR-BA'))
    assert.deepEqual(expandRef({ kind: 'city', code: 'TYO', label: '' }).map((a) => a.iata).sort(), ['HND', 'NRT'])
    const set = expandSet({ include: [{ kind: 'country', code: 'SG', label: '' }, { kind: 'airport', code: 'BKK', label: '' }], exclude: ['BKK'] })
    assert.ok(!set.some((a) => a.iata === 'BKK') && set.some((a) => a.iata === 'SIN'))
  })
  it('autocomplete acha cidade/aeroporto/país e não aceita códigos inventados', () => {
    const s = searchPlaces('salvador')
    assert.ok(s.some((x) => x.kind === 'airport' && x.code === 'SSA'))
    assert.ok(searchPlaces('tailandia').some((x) => x.kind === 'country' && x.code === 'TH'))
    assert.equal(resolveRef({ kind: 'airport', code: 'XQZ' }), null)
    assert.equal(resolveRef({ kind: 'country', code: 'ZZ' }), null)
    assert.equal(resolveRef({ kind: 'region', code: 'atlantida' }), null)
    assert.equal(getAirport('ssa')?.tz, 'America/Bahia')
  })
  it('distância haversine e aeroportos próximos', () => {
    const ssa = getAirport('SSA')!
    const aju = getAirport('AJU')!
    const d = haversineKm(ssa, aju)
    assert.ok(d > 240 && d < 270, `SSA-AJU ${d}`) // linha reta (estrada ~320 km)
    assert.ok(Math.abs(haversineKm(getAirport('GRU')!, getAirport('LIS')!) - 7950) < 150)
    const near = airportsNear(ssa, 350).map((a) => a.iata)
    assert.ok(near[0] === 'SSA' && near.includes('AJU') && near.includes('IOS'))
  })
})

describe('datas', () => {
  it('expande exata, intervalo, flex e mês; descarta o passado e duplicatas', () => {
    assert.deepEqual(expandWindows([{ mode: 'flex', date: '2026-11-12', flexDays: 2 }], TODAY), ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
    assert.equal(expandWindows([{ mode: 'month', month: '2027-02' }], TODAY).length, 28)
    assert.deepEqual(expandWindows([{ mode: 'range', from: '2026-11-01', to: '2026-11-05' }], TODAY), [])
    assert.equal(expandWindows([{ mode: 'exact', date: '2026-12-01' }, { mode: 'range', from: '2026-11-30', to: '2026-12-01' }], TODAY).length, 2)
  })
  it('ida e volta respeita duração mínima/máxima', () => {
    const pairs = datePairs({ tripType: 'roundtrip', windows: [{ mode: 'range', from: '2026-12-01', to: '2026-12-02' }], returnWindows: [], minStayDays: 7, maxStayDays: 8 }, TODAY)
    assert.deepEqual(pairs.map((p) => `${p.depart}>${p.ret}`), ['2026-12-01>2026-12-08', '2026-12-01>2026-12-09', '2026-12-02>2026-12-09', '2026-12-02>2026-12-10'])
    assert.ok(validateDates({ tripType: 'oneway', windows: [{ mode: 'exact', date: '2026-01-01' }], returnWindows: [], minStayDays: null, maxStayDays: null }, TODAY).length > 0)
  })
})

describe('restrições obrigatórias', () => {
  const noUsCa = cfg((c) => {
    c.constraints.forbiddenConnectionCountries = ['US', 'CA']
    c.baggage.checked = 'required'
  })
  it('rejeita conexão proibida (EUA) e aceita via Doha', () => {
    assert.equal(evaluateOffer(offer([viaUsa]), noUsCa, fx, TODAY).status, 'excluded')
    const ok = evaluateOffer(offer([viaDoha]), noUsCa, fx, TODAY)
    assert.equal(ok.status, 'eligible', JSON.stringify(ok.checks))
    assert.deepEqual(ok.connections.map((c) => c.airport), ['DOH', 'GRU'])
  })
  it('sem aeroportos de conexão na fonte → verificação pendente, nunca compatível', () => {
    const cached = offer([{ ...viaDoha, segments: [], stops: 2 }], 400000, { verification: 'cached' })
    const ev = evaluateOffer(cached, noUsCa, fx, TODAY)
    assert.equal(ev.status, 'pending')
    assert.ok(ev.checks.some((c) => c.code === 'connections' && c.level === 'unknown'))
  })
  it('escalas sem horário (resumo da busca) bastam para país proibido', () => {
    const viaLax = offer([{ ...viaDoha, segments: [], stops: 2, via: ['LAX', 'GRU'] }], 1, { verification: 'assisted' })
    assert.equal(evaluateOffer(viaLax, noUsCa, fx, TODAY).status, 'excluded')
    const viaDoh = offer([{ ...viaDoha, segments: [], stops: 2, via: ['DOH', 'GRU'] }], 1, { verification: 'assisted' })
    assert.equal(evaluateOffer(viaDoh, noUsCa, fx, TODAY).status, 'eligible')
    const partial = offer([{ ...viaDoha, segments: [], stops: 2, via: ['DOH'] }], 1, { verification: 'assisted' })
    assert.equal(evaluateOffer(partial, noUsCa, fx, TODAY).status, 'pending')
    // tempo mínimo de conexão continua sem verificação
    assert.equal(evaluateOffer(viaDoh, cfg((c) => (c.constraints.minConnectionMinutes = 60)), fx, TODAY).status, 'pending')
  })
  it('bagagem desconhecida → pendente; sem mala → excluída', () => {
    assert.equal(evaluateOffer(offer([viaDoha], 1, { baggage: { checked: null, carryOn: null, note: null } }), noUsCa, fx, TODAY).status, 'pending')
    assert.equal(evaluateOffer(offer([viaDoha], 1, { baggage: { checked: 0, carryOn: 1, note: null } }), noUsCa, fx, TODAY).status, 'excluded')
  })
  it('self-transfer: proibido → excluída; desconhecido → pendente', () => {
    const c = cfg((x) => (x.constraints.forbidSelfTransfer = true))
    assert.equal(evaluateOffer(offer([viaDoha], 1, { selfTransfer: true }), c, fx, TODAY).status, 'excluded')
    assert.equal(evaluateOffer(offer([viaDoha], 1, { selfTransfer: null }), c, fx, TODAY).status, 'pending')
  })
  it('limites de conexões, tempo de conexão, troca de aeroporto e preço máximo', () => {
    assert.equal(evaluateOffer(offer([viaDoha]), cfg((c) => (c.constraints.maxStops = 1)), fx, TODAY).status, 'excluded')
    assert.equal(evaluateOffer(offer([viaDoha]), cfg((c) => (c.constraints.minConnectionMinutes = 120)), fx, TODAY).status, 'eligible')
    assert.equal(evaluateOffer(offer([viaDoha]), cfg((c) => (c.constraints.minConnectionMinutes = 180)), fx, TODAY).status, 'excluded') // DOH: 150 min
    assert.equal(evaluateOffer(offer([viaDoha]), cfg((c) => (c.constraints.maxConnectionMinutes = 120)), fx, TODAY).status, 'excluded')
    const change = slice([seg('BKK', 'LHR', '2026-12-10T08:00', '2026-12-10T15:00'), seg('LGW', 'SSA', '2026-12-10T22:00', '2026-12-11T06:00')])
    assert.equal(evaluateOffer(offer([change]), cfg((c) => (c.constraints.forbidAirportChange = true)), fx, TODAY).status, 'excluded')
    assert.equal(evaluateOffer(offer([viaDoha], 900000), cfg((c) => (c.constraints.maxPrice = { amountMinor: 100000, currency: 'USD' })), fx, TODAY).status, 'excluded')
    assert.equal(evaluateOffer(offer([viaDoha], 900000, { price: { amountMinor: 9000, currency: 'THB' } }), cfg((c) => (c.constraints.maxPrice = { amountMinor: 100000, currency: 'BRL' })), fx, TODAY).status, 'pending')
  })
  it('calcula tempo de conexão em hora local e detecta conexão noturna', () => {
    const ev = evaluateOffer(offer([viaDoha]), cfg((c) => (c.constraints.forbidOvernightConnections = true)), fx, TODAY)
    const gru = ev.connections.find((c) => c.airport === 'GRU')!
    assert.equal(gru.minutes, 450)
    assert.ok(gru.overnight)
    assert.equal(ev.status, 'excluded')
  })
})

describe('dinheiro e moedas', () => {
  it('converte decimal em centavos sem float', () => {
    assert.equal(decimalToMinor('1234.56', 'BRL'), 123456)
    assert.equal(decimalToMinor('0.1', 'USD'), 10)
    assert.equal(decimalToMinor('19.995', 'EUR'), 2000)
    assert.equal(decimalToMinor('45000', 'JPY'), 45000)
    assert.equal(decimalToMinor(4321.1, 'BRL'), 432110)
    assert.throws(() => decimalToMinor('12,3.4', 'BRL'))
  })
  it('câmbio usa a tabela configurada e não assume 1:1 sem taxa', () => {
    assert.deepEqual(fx({ amountMinor: 10000, currency: 'USD' }, 'BRL'), { amountMinor: 55000, currency: 'BRL' })
    assert.deepEqual(fx({ amountMinor: 60000, currency: 'EUR' }, 'USD'), { amountMinor: 65455, currency: 'USD' })
    assert.equal(fx({ amountMinor: 100, currency: 'THB' }, 'BRL'), null)
  })
  it('custo total inclui terrestre configurado e marca bagagem desconhecida', () => {
    const c = cfg((x) => {
      x.baggage.checked = 'required'
      x.ground = [{ airport: 'AJU', toLabel: 'Salvador', minutes: 300, costMinor: 9000, currency: 'BRL', source: 'manual' }]
    })
    const toAju = slice([seg('BKK', 'DOH', '2026-12-10T08:00', '2026-12-10T11:30'), seg('DOH', 'AJU', '2026-12-10T14:00', '2026-12-10T23:00')])
    const ev = evaluateOffer(offer([toAju], 400000), c, fx, TODAY)
    assert.equal(ev.cost.total?.amountMinor, 409000)
    assert.equal(ev.cost.ground.status, 'manual')
    assert.equal(ev.cost.totalStatus, 'verified')
    const unk = evaluateOffer(offer([toAju], 400000, { baggage: { checked: null, carryOn: null, note: null } }), c, fx, TODAY)
    assert.equal(unk.cost.totalStatus, 'unknown')
  })
})

describe('normalização de provedores', () => {
  it('Aviasales: cache, sem bagagem, link de pesquisa, hora local preservada', () => {
    const o = normalizeTicket(
      { origin: 'BKK', destination: 'SSA', price: 4321, airline: 'QR', flight_number: 833, departure_at: '2026-12-10T08:00:00+07:00', transfers: 2, duration: 1800, duration_to: 1800, link: '/search/BKK1012SSA1?t=x' },
      'BRL',
      '2026-11-11T00:00:00Z'
    )!
    assert.equal(o.slices[0].departLocal, '2026-12-10T08:00')
    assert.equal(o.slices[0].arriveLocal, '2026-12-11T04:00') // 01:00Z + 30h = 07:00Z = 04:00 em Salvador
    assert.equal(o.price.amountMinor, 432100)
    assert.equal(o.baggage.checked, null)
    assert.equal(o.verification, 'cached')
    assert.equal(o.linkKind, 'search')
    assert.ok(o.deepLink!.startsWith('https://www.aviasales.com/search/'))
  })
  it('Duffel: trechos, bagagem mínima garantida, reembolso, duração ISO', () => {
    assert.equal(isoDurationMin('PT13H05M'), 785)
    assert.equal(isoDurationMin('P1DT2H'), 1560)
    const o = normalizeDuffelOffer(
      {
        id: 'off_1',
        total_amount: '812.40',
        total_currency: 'USD',
        slices: [
          {
            origin: { iata_code: 'BKK' },
            destination: { iata_code: 'SSA' },
            duration: 'PT30H',
            segments: [
              { origin: { iata_code: 'BKK' }, destination: { iata_code: 'DOH' }, departing_at: '2026-12-10T08:00:00', arriving_at: '2026-12-10T11:30:00', marketing_carrier: { iata_code: 'QR' }, marketing_carrier_flight_number: '833', passengers: [{ baggages: [{ type: 'checked', quantity: 2 }, { type: 'carry_on', quantity: 1 }] }] },
              { origin: { iata_code: 'DOH' }, destination: { iata_code: 'SSA' }, departing_at: '2026-12-10T14:00:00', arriving_at: '2026-12-11T00:00:00', marketing_carrier: { iata_code: 'QR' }, marketing_carrier_flight_number: '773', passengers: [{ baggages: [{ type: 'checked', quantity: 1 }] }] }
            ]
          }
        ],
        conditions: { refund_before_departure: { allowed: false } }
      },
      '2026-11-11T00:00:00Z'
    )!
    assert.equal(o.price.amountMinor, 81240)
    assert.equal(o.baggage.checked, 1)
    assert.equal(o.baggage.carryOn, 0)
    assert.equal(o.refundable, false)
    assert.equal(o.slices[0].stops, 1)
    assert.equal(o.slices[0].durationMin, 1800)
  })
})

describe('deduplicação, ranking e diversificação', () => {
  it('mesmo itinerário de fontes diferentes tem a mesma identidade', () => {
    const live = offer([viaDoha])
    const cached = offer([{ ...viaDoha, segments: [], carriers: ['QR'], firstFlightNumber: '833' }], 1, { provider: 'travelpayouts', verification: 'cached' })
    assert.equal(fingerprint(live, 'k'), fingerprint(cached, 'k'))
    assert.notEqual(fingerprint(live, 'k'), fingerprint(offer([viaUsa]), 'k'))
  })
  it('ordena por estratégia e diversifica origens no topo', () => {
    const c = cfg()
    const mk = (from: string, price: number, day: string): NormalizedOffer =>
      offer([slice([seg(from, 'SSA', `2026-12-${day}T08:00`, `2026-12-${day}T23:00`, 'QR', `${from}${day}`)])], price)
    const list = [mk('BKK', 300000, '10'), mk('BKK', 301000, '11'), mk('BKK', 302000, '12'), mk('BKK', 303000, '13'), mk('SIN', 320000, '10'), mk('KUL', 330000, '10')]
    const scored = scoreAll(list.map((o) => ({ offer: o, ev: evaluateOffer(o, c, fx, TODAY) })), c)
    const byPrice = sortScored(scored, 'price')
    assert.equal(byPrice[0].offer.price.amountMinor, 300000)
    assert.ok(byPrice[0].highlights.includes('Menor tarifa'))
    const top3 = diversify(byPrice, 3).slice(0, 3).map((s) => s.offer.slices[0].from)
    assert.deepEqual(new Set(top3), new Set(['BKK', 'SIN', 'KUL']))
    assert.equal(diversify(byPrice, 3).length, list.length) // nada é descartado
  })
})

describe('planejador', () => {
  const tp = { id: 'tp', capabilities: { oneWay: true, roundTrip: true, monthRange: true, multiAirport: true, livePrices: false, baggage: false, segments: false, deepLink: 'search' as const, passengersMix: false, automated: true, dailyQuota: null } }
  const live = { id: 'live', capabilities: { ...tp.capabilities, monthRange: false, livePrices: true, baggage: true, segments: true } }
  const c = cfg((x) => {
    x.origins.include = [{ kind: 'region', code: 'southeast_asia', label: '' }]
    x.destinations.include = [{ kind: 'airport', code: 'SSA', label: '' }, { kind: 'airport', code: 'AJU', label: '' }]
    x.dates.windows = [{ mode: 'range', from: '2026-12-10', to: '2026-12-25' }]
  })
  it('universo limitado e descoberta por mês, intercalando países', () => {
    const u = buildUniverse(c, TODAY)
    assert.ok(u.origins.length <= 40 && u.size === u.pairs.length * 16)
    for (const hub of ['BKK', 'SIN', 'KUL', 'SGN', 'HAN', 'VTE']) assert.ok(u.origins.some((a) => a.iata === hub), `hub ${hub} cortado`)
    const disc = planDiscovery(u, [tp], paxKey(c), false)
    assert.equal(disc.length, u.pairs.length) // 1 mês
    const firstCountries = new Set(disc.slice(0, 8).map((s) => getAirport(s.origin)!.country))
    assert.ok(firstCountries.size >= 5, [...firstCountries].join())
  })
  it('sem provedor de mês: amostra poucas datas (não explode)', () => {
    const u = buildUniverse(c, TODAY)
    assert.equal(planDiscovery(u, [live], paxKey(c), false).length, u.pairs.length * 3)
  })
  it('aprofunda só os pares promissores e não repete consultas', () => {
    const u = buildUniverse(c, TODAY)
    const pk = paxKey(c)
    const pairMin = new Map([['BKK|SSA', 400000], ['SIN|SSA', 500000]])
    const deep = planDeepen(u, [live], pk, pairMin, new Map([['BKK|SSA', new Map([['2026-12-12', 400000]])]]), 1)
    assert.equal(deep.length, 16)
    assert.ok(deep.every((d) => d.origin === 'BKK'))
    assert.equal(deep.sort((a, b) => b.priority - a.priority)[0].departDate, '2026-12-12')
    const val = planValidate([{ origin: 'BKK', destination: 'SSA', departDate: '2026-12-12', returnDate: null }], [live], pk)
    assert.equal(newSpecs(val, new Set(deep.map((d) => d.key))).length, 0)
  })
  it('cobertura conta combinações cobertas, não tarefas', () => {
    const u = buildUniverse(c, TODAY)
    const t = { provider: 'tp', status: 'done' as const, finishedAt: TODAY, minPriceMinor: null, returnDate: null }
    const cov = coverageOf(u, [{ ...t, key: 'a', origin: 'BKK', destination: 'SSA', departDate: '2026-12' }, { ...t, key: 'b', origin: 'SIN', destination: 'SSA', departDate: '2026-12-10' }])
    assert.equal(cov.covered, 17)
    assert.ok(cov.percent > 0 && cov.percent < 100)
  })
})

describe('validação de configuração e importação', () => {
  it('normalizeConfig descarta códigos inexistentes e corta valores absurdos', () => {
    const dropped: string[] = []
    const c = normalizeConfig({ origins: { include: [{ kind: 'airport', code: 'BKK' }, { kind: 'airport', code: 'QQQ' }] }, passengers: { adults: 99, infants: 5 }, budget: { maxQueriesPerRun: -3 } }, dropped)
    assert.deepEqual(c.origins.include.map((r) => r.code), ['BKK'])
    assert.deepEqual(dropped, ['airport:QQQ'])
    assert.equal(c.passengers.adults, 9)
    assert.equal(c.budget.maxQueriesPerRun, 1)
  })
  it('importa CSV válido e reporta linhas inválidas sem inventar campos', () => {
    const csv = 'origin,destination,depart,price,currency,stops,checked_bags,link\nBKK,SSA,2026-12-10 08:00,4321.50,BRL,2,,https://example.com/x\nXXX,SSA,2026-12-10 08:00,10,BRL,0,,'
    const r = parseImport(csv, { source: 'teste' })
    assert.equal(r.offers.length, 1)
    assert.equal(r.offers[0].price.amountMinor, 432150)
    assert.equal(r.offers[0].baggage.checked, null)
    assert.equal(r.offers[0].linkKind, 'search')
    assert.equal(r.offers[0].verification, 'imported')
    assert.equal(r.errors.length, 1)
  })
})
