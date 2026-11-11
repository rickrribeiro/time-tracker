/**
 * Links de PESQUISA equivalente (formatos públicos de URL de busca). Sempre rotulados como
 * pesquisa: abrem a busca da rota/data, não a oferta exata nem garantem o mesmo preço.
 */
export function searchLinks(o: string, d: string, depart: string, ret: string | null, currency: string, adults = 1): { label: string; url: string }[] {
  const q = `Flights from ${o} to ${d} on ${depart}${ret ? ` through ${ret}` : ' oneway'}${adults > 1 ? ` for ${adults} adults` : ''}`
  const google = `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=${currency}&hl=pt-BR`
  const yymmdd = (s: string): string => s.slice(2).replace(/-/g, '')
  const sky = `https://www.skyscanner.com.br/transporte/passagens-aereas/${o.toLowerCase()}/${d.toLowerCase()}/${yymmdd(depart)}/${ret ? `${yymmdd(ret)}/` : ''}?adultsv2=${adults}&currency=${currency}`
  return [
    { label: 'Pesquisar no Google Flights', url: google },
    { label: 'Pesquisar no Skyscanner', url: sky }
  ]
}
