import type { ProviderCapabilities } from '../../../shared/flights'
import { duffel } from './duffel'
import { travelpayouts } from './travelpayouts'
import type { FlightProvider } from './types'

const none: ProviderCapabilities = {
  oneWay: true,
  roundTrip: true,
  monthRange: false,
  multiAirport: false,
  livePrices: false,
  baggage: true,
  segments: true,
  deepLink: 'search',
  passengersMix: true,
  automated: false,
  dailyQuota: null
}

/** Importação manual: JSON/CSV estruturado ou texto de alerta (a IA só estrutura o texto). */
const manualImport: FlightProvider = {
  id: 'import',
  label: 'Importação de resultados',
  kind: 'import',
  capabilities: none,
  docs: 'docs/passagens.md#importação',
  notes: [
    'Cole JSON/CSV de uma fonte legítima ou o texto de um alerta de preço recebido por e-mail.',
    'Fica marcado como "Importado" com a data da observação informada; nunca vira "ao vivo".'
  ],
  async status() {
    return { configured: true, available: true, reason: null }
  }
}

/**
 * Skyscanner via Claude Code + Chrome — sob demanda, com o usuário presente.
 * O app dispara `claude --chrome -p` liberando só as ferramentas do Chrome (assisted.ts).
 * Nunca entra no agendador. Pega promoções relâmpago porque lê a busca ao vivo do Skyscanner.
 */
const skyscannerChrome: FlightProvider = {
  id: 'skyscanner_chrome',
  label: 'Skyscanner via Claude Code + Chrome',
  kind: 'assisted',
  capabilities: { ...none, livePrices: true, baggage: false, segments: false, monthRange: false },
  docs: 'https://code.claude.com/docs/en/chrome',
  notes: [
    'Sob demanda (botão no monitor), você acompanhando no seu Chrome. Uma sessão do Claude por clique, cobrindo várias combinações.',
    'Requer Chrome aberto com a extensão Claude in Chrome conectada e o `claude` logado (plano pago). Só abrir a sessão com as ferramentas do Chrome custa ~US$ 0,10–0,20 (equivalente API; medido 0,17 com sonnet, ~105 mil tokens de contexto) — mesmo se o Chrome não estiver conectado; o total de cada execução aparece no plano e em uso de IA.',
    'Se o Skyscanner pedir verificação ("pressione e segure"/CAPTCHA), o Claude para — o app não contorna. Os termos do Skyscanner restringem acesso automatizado: use com moderação.',
    'Lê o resumo da busca: preço, horários, nº de escalas e aeroportos de escala; bagagem só se a página mostrar.'
  ],
  async status({ getSetting }) {
    const on = (await getSetting('flights_chrome_assisted')) === '1'
    return on
      ? { configured: true, available: true, reason: 'Sob demanda: use "Buscar no Skyscanner" no monitor.' }
      : { configured: false, available: false, reason: 'Desativado (ative nas fontes).' }
  }
}

export const PROVIDERS: FlightProvider[] = [travelpayouts, duffel, skyscannerChrome, manualImport]

export function getProvider(id: string): FlightProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export function automatedProviders(): FlightProvider[] {
  return PROVIDERS.filter((p) => p.capabilities.automated && p.search)
}
