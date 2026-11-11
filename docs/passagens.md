# Monitoramento de passagens

Página **Viagens → Passagens** (`#/trip-monitoring`) e detalhe do monitor (`#/flight-monitor?id=N`).
O sistema descobre, compara e acompanha passagens quando origem/destino não estão totalmente
definidos: vários países, regiões, aeroportos alternativos e janelas de datas.

> **Princípio:** a IA planeja e recomenda; o código executa regras, buscas, filtros, ranking e
> deduplicação. Nada aparece como verificado ou ao vivo se não for.

## Arquitetura

```
src/modules/flights/             UI (dashboard, editor, explorador, calendário, histórico, plano, alertas)
   └─ window.api.flightMon.*  →  POST /api/rpc/flightMon:<ação>
server/flights/
   rpc.ts         canais RPC (nenhuma busca externa síncrona: `run` só enfileira)
   geo.ts         base de aeroportos (data/airports.json) · expansão · autocomplete · haversine · hubs
   dates.ts       janelas (exata/intervalo/±N/mês, várias) → combinações válidas ida/volta
   validate.ts    "schema" da configuração: normaliza, corta absurdos, descarta códigos inexistentes
   planner.ts     universo · descoberta → aprofundamento → validação · cobertura · dedupe de consultas
   evaluate.ts    conexões (hora local + fuso) · restrições · custo efetivo · pontuação · diversificação · fingerprint
   runner.ts      executor de jobs, orçamento, cache, retry/backoff, alertas, agendador
   views.ts       resumo do dashboard, página de ofertas, calendário, histórico, plano
   providers/     interface + adaptadores (travelpayouts, duffel) + importação + assistido
   importer.ts    JSON/CSV → ofertas validadas
   ground.ts      aeroportos próximos + rota terrestre (OSRM) + custo/km configurado
   ai.ts          linguagem natural → configuração; texto de alerta → importação; análise de trade-offs
   repo.ts        sql.js (escritas em transação, 1 save por lote)
shared/flights.ts tipos e helpers puros usados pelo servidor e pelo front
```

O projeto não tem NestJS, Prisma nem Redis/BullMQ: é Fastify + sql.js local, para um único
usuário. Os "jobs" seguem as mesmas garantias de uma fila, mas sem serviço extra:

- tarefas persistidas, com claim atômico;
- `UNIQUE(monitorId, key)`, para idempotência;
- retry com backoff exponencial ou `Retry-After`;
- timeout por consulta e por execução, e cancelamento;
- limite de execuções simultâneas (`flights_concurrency`) e 2 consultas em paralelo por execução;
- retomada após reinício (`recoverInterrupted`).

O agendador global (`startScheduler`) chama `flights.schedulerTick` a cada 5 minutos.

### Tabelas (em `schema.ts`, criadas com `IF NOT EXISTS`, sem alterar tabelas existentes)

| Tabela | Conteúdo |
|---|---|
| `flight_monitors` | nome, status (`active`/`paused`/`draft`), configuração em JSON validado, metadados de execução, `legacyWatchId`/`legacy` |
| `flight_search_tasks` | plano e cobertura: uma linha por consulta atômica (provedor, estágio, rota, data/mês, status, tentativas, erro, menor preço) |
| `flight_runs` | execuções: consultas, cache, ofertas, mensagem, status (`done`/`partial`/`budget`/`failed`/`interrupted`) |
| `flight_offers` | itinerários deduplicados por *fingerprint* (independe de provedor e preço), favoritos, preço anterior, fontes, disponibilidade |
| `flight_price_observations` | histórico de toda observação de preço; sobrevive quando a oferta some |
| `flight_alert_events` | alertas disparados (`dedupeKey UNIQUE`, para não notificar duas vezes) |
| `flight_cache` | cache de respostas de provedores, rotas OSRM, rascunhos e respostas da IA |
| `flight_provider_usage` | consultas por provedor por dia |

Dinheiro é sempre guardado em centavos (`INTEGER`) com a moeda. Horários de voo ficam em hora
local do aeroporto, e as durações são calculadas com o fuso IANA da base. O câmbio vem da tabela
de Configurações → Finanças; sem taxa configurada, a conversão é "desconhecida" e nunca 1:1.

**Migração:** os registros antigos de `flight_watches` (texto livre e um preço) viram monitores
em "aguardando configuração" no boot. O processo é idempotente, e a tabela antiga não é apagada.
Texto como "osaka" vira a cidade inteira quando ela existe na base. O preço antigo fica em
`legacy` e não entra no histórico comparável, porque não tinha itinerário.

## Fontes de passagens (situação em nov/2026)

| Fonte | Situação | Uso no app |
|---|---|---|
| **Aviasales Data API** (Travelpayouts) | Gratuita com token; o acesso automatizado é permitido. Preços em **cache** (buscas de usuários nas últimas ~48 h), sem bagagem nem aeroportos de conexão. | **Descoberta**: uma consulta cobre um mês inteiro por par de aeroportos. |
| **Duffel** | API real com preço ao vivo, trechos, bagagem incluída e reembolso. Exige conta em modo **live** (verificação). O token de teste só traz a companhia fictícia "Duffel Airways" e é recusado. Busca grátis até 1500 buscas por reserva; sem reservas, ~US$ 0,005 por busca. | **Aprofundamento e validação** |
| Importação (JSON/CSV/texto de alerta) | Sempre disponível | Alternativa sem API; dados marcados como "Importado" |
| **Skyscanner via Claude Code + Chrome** | Sob demanda, com você presente; lê a busca ao vivo (pega promoções relâmpago) | Botão "🔍 Skyscanner (Chrome)" no monitor (veja abaixo) |
| **Blogs de promoção (RSS)** | Melhores Destinos e Passageiro de Primeira por padrão (configurável) | Aba "Promoções (blogs)" + alerta de post novo |
| Google Flights | Sem API; termos e robots.txt proíbem coleta automatizada | Só **link de pesquisa** |
| Skyscanner (API) | API só para parceiros grandes; os "Skyscanner" do RapidAPI são raspadores de terceiros (adaptador antigo **removido**) | — (usa-se o Chrome, acima) |
| Amadeus Self-Service | Desativado em jul/2026 | — |
| Kiwi Tequila | Fechado a novos cadastros | — |

### Configurar

Vá em **Passagens → ⚙️ Fontes e execução**:

1. **Aviasales**: crie uma conta em travelpayouts.com, copie o token em *Profile → API token*,
   cole e clique em "Testar conexão". O mercado (padrão `br`) afeta a cobertura do cache.
2. **Duffel**: cole um access token **live** (`duffel_live_…`). Mantenha o orçamento de consultas baixo.
3. **Execução**:
   - quantos monitores buscam ao mesmo tempo;
   - modelo da IA (padrão `haiku`);
   - OSRM (rotas terrestres; o padrão é o servidor público de demonstração, só sob demanda e
     com cache de 30 dias);
   - custo por km para estimar o transporte terrestre.

Os tokens são salvos via `settings:set` e criptografados com AES-GCM (`SENSITIVE_KEYS`).

### Interface de provedor

Cada provedor (`providers/types.ts`) declara suas capacidades: só ida, ida e volta, mês inteiro,
vários aeroportos, preço ao vivo, bagagem, trechos, tipo de link (`offer`/`search`/`none`), mix
de passageiros, se pode rodar automaticamente e cota diária. Os erros são tipados
(`config`/`auth`/`quota` desligam o provedor naquela execução; `timeout`/`network`/`rate_limit`/
`upstream` voltam com backoff). Para criar um provedor novo: implemente `FlightProvider` e
registre em `providers/index.ts`.

## Planejamento das buscas

1. **Universo:** origens × destinos (no máximo 40 aeroportos por lado, em rodízio entre países e
   priorizando hubs; pares a menos de 120 km são descartados) × combinações de datas (passado e
   duração impossível descartados).
2. **Descoberta:** com Aviasales, uma consulta por par e mês. Só com Duffel, 3 datas espaçadas
   por par. Os pares são intercalados por país, para que uma cobertura parcial já seja diversa.
3. **Aprofundamento:** só os pares com melhor preço (√pares + 4, e mais quando você pede "mais
   opções"), data a data, começando pelas datas baratas.
4. **Validação:** as melhores opções vindas de cache ou importação são revalidadas ao vivo, se
   houver fonte ao vivo.

A chave de tarefa não inclui o estágio, então a mesma consulta nunca é feita duas vezes. Cada
execução respeita: consultas por execução, consultas por dia (do monitor), cota do provedor e
tempo máximo. O que sobra fica na fila e o botão vira **"Continuar busca"**. O recorrente refaz
primeiro as consultas mais antigas. Cobertura = combinações (aeroporto × aeroporto × data)
efetivamente cobertas ÷ universo, e com cobertura parcial a UI avisa que o menor preço é o
menor **encontrado**.

**"Buscar mais opções" (+5/10/20/30)** aumenta a meta de exibição e o número de pares
aprofundados, explorando combinações ainda não consultadas.

## Restrições, custo e ranking (determinísticos)

**Restrições obrigatórias:**
- conexões máximas, duração máxima, países, aeroportos e companhias proibidos;
- self-transfer, troca de aeroporto, conexão de madrugada, tempo mínimo e máximo de conexão;
- preço máximo, mala despachada e de mão, tarifa reembolsável.

Se a oferta viola uma restrição, vai para **Excluídos**, com o motivo. Se falta informação
(bagagem não informada, conexões não detalhadas, câmbio ausente, bilhete único não confirmado),
vai para **Verificação pendente**, nunca para "compatível".

**Custo efetivo** = tarifa (convertida) + transporte terrestre do aeroporto alternativo
(informado ou estimado). O status pode ser *verificado*, *estimado* ou *incompleto*.
Porta a porta = duração do voo + tempo terrestre.

**Pontuação (0–100):** média ponderada (pesos de 0 a 10, configuráveis) de:
- preço (o menor custo dividido pelo custo da oferta);
- duração;
- número de conexões;
- conforto das conexões (pelo estilo escolhido; troca de aeroporto e madrugada penalizam);
- horários (janela de chegada, preferência por voos noturnos);
- companhias preferidas.

Há uma pequena penalidade por incerteza (cache ou custo incompleto). A pontuação de cada
componente aparece na linha expandida.

**Diversificação:** escolha gulosa que penaliza repetir origem, país, destino, data, companhia,
número de conexões e faixa de duração no topo. Só muda a ordem; o banco guarda tudo. Meta de
exibição: 10 a 30 opções, conforme a amplitude (ou valor fixo no monitor).

## Alertas

São avaliados depois de cada execução, só sobre opções **elegíveis** e comparáveis (mesma moeda
e mesma configuração de passageiros):
- preço abaixo de X;
- queda de X% no mesmo itinerário;
- novo menor preço comparável (só se havia histórico antes);
- voo novo bem pontuado;
- favorita mudou de preço ou sumiu.

Os alertas usam a central de notificações existente (`notify`), com deduplicação por chave.

## IA e economia de tokens

| Uso | Chamadas | Economia |
|---|---|---|
| Criar com IA (linguagem natural → configuração) | 1 por pedido | Cache por hash do texto (7 dias); resposta em JSON enxuto; códigos revalidados na base; distâncias e rotas calculadas pelo código |
| Texto de alerta/e-mail → importação | 1 por texto | Cache de 30 dias; a prévia e a gravação reutilizam o mesmo resultado |
| Analisar trade-offs | 1 sob demanda | Entrada de 1 linha por oferta (≤ 12), dados já ordenados; cache de 3 dias |
| Buscas, filtros, ranking, dedupe, distâncias | 0 | Tudo em código |

- Modelo configurável (padrão `haiku`) e limite de chamadas de IA por monitor por dia.
- O "custo" exibido é a estimativa do CLI em **preço equivalente de API**. Com login de assinatura (Pro/Max) não há cobrança à parte: conta no limite do plano. Só é cobrado se o CLI usar chave de API.
- O consumo é registrado em `ai_usage` com a fonte `passagens`.
- A IA não roda dentro das execuções de busca.

## Skyscanner via Claude Code + Chrome

A Aviasales é cache de até 48 h e perde a maioria das promoções relâmpago. Para pegá-las, o
app pesquisa o Skyscanner **no seu Chrome**, sob demanda e com você acompanhando
(`server/flights/assisted.ts`).

- **Ativar:** em Fontes e execução, ligue "Skyscanner via Claude Code + Chrome". O modelo é
  configurável (padrão `sonnet`).
- **Requisitos:** Chrome aberto com a extensão **Claude in Chrome** conectada e o `claude`
  logado num plano pago. Verificado: o `claude --chrome -p` expõe as ferramentas
  `mcp__claude-in-chrome__*` e o app libera **só** essas.
- **Fluxo:**
  1. O botão "🔍 Skyscanner (Chrome)" abre o seletor (`buildPreview`):
     - **Sugestões** (até 24), marcáveis uma a uma: primeiro as combinações com melhor preço
       já visto, depois um rodízio de pares (países intercalados) em que a data muda a cada par
       e a cada rodada (`spreadOrder`: extremos, meio, quartos…), sem repetir o consultado
       nas últimas 12 h.
     - **Escolher rota e datas:** origem e destino (com cidade e país quando o lado tem
       vários países) e **todas** as datas do intervalo, com o preço conhecido e o que já foi
       consultado. "Marcar todas" seleciona o intervalo inteiro da rota.
     - Até 30 combinações por execução. O servidor revalida cada escolha contra os pares e
       datas do monitor e remonta as URLs (`validatePicks`).
  2. Ao confirmar, roda sessões do Claude de até 5 combinações, uma após a outra (sessões
     curtas mantêm pequeno o contexto com o texto das páginas). Cada sessão abre uma aba,
     navega pelas URLs de busca e lê o texto da página, sem screenshots repetidos nem HTML
     inteiro. Chrome desconectado, verificação de robô ou cancelamento param as sessões
     seguintes, e o que não rodou volta para a fila.
     **Ao vivo:** depois de ler cada combinação, o Claude escreve uma linha `RESULT {…}` no
     streaming (`--output-format stream-json`); o app grava na hora e a tela atualiza. O JSON
     final só completa o que não veio nessas linhas.
  3. A sessão devolve JSON compacto: preço, horários, escalas, aeroportos de escala, companhia,
     self-transfer e bagagem quando visível.
  4. O JSON passa pelo mesmo validador da importação; as ofertas entram como "Busca assistida",
     com o link da pesquisa.
- **Restrições:** os aeroportos de escala lidos já bastam para checar países e aeroportos
  proibidos. Tempo de conexão e troca de aeroporto ficam "pendentes", porque a página não traz
  esses horários.
- **Verificação de robô:** se o Skyscanner pedir verificação ("pressione e segure"/CAPTCHA), o
  Claude **para**; o app não contorna. As tarefas voltam para a fila. Os termos do Skyscanner
  restringem acesso automatizado; o uso aqui é pessoal, raro e supervisionado.
- **Custo:** cada sessão (até 5 combinações) tem um custo fixo: só abrir a sessão com as ferramentas do Chrome custa ~US$ 0,10–0,20 equivalente
  API (medido: US$ 0,17 com sonnet, ~105 mil tokens de contexto), mesmo quando o Chrome não
  está conectado. O total de cada execução aparece em Plano → Execuções e em uso de IA
  (`passagens-chrome`).
- **Acompanhadas:** toda combinação pesquisada no Skyscanner entra na lista
  `flight_tracked_combos` do monitor (as anteriores a esta lista foram importadas uma vez
  das tarefas). A aba "Acompanhadas" mostra o menor preço de cada combinação em cada dia
  local de leitura (observações de todas as fontes, sem ofertas excluídas), a variação
  em relação ao dia anterior, o menor já visto e um gráfico comparativo. "Pesquisar de novo"
  abre o seletor já com todas marcadas.
- **Mesmo voo duas vezes:** sem número de voo, a assinatura do itinerário inclui a chegada; o
  mesmo voo visto duas vezes na mesma leitura (ex.: "mais barato" e "melhor") fica com o
  menor preço, sem contar como mudança de preço.
- Não entra no agendador. Uma busca no Chrome por vez.
- **Reinício do servidor:** `bin/rickos-*` não reinicia sozinho com busca no Chrome em
  andamento (`/api/health` → `busy`). Ao desligar, o servidor fecha o SSE, mata a sessão do
  Claude e sai em até 8 s; o boot devolve à fila o que não foi lido. (Antes, o `close()`
  esperava o SSE para sempre e o processo ficava vivo sem a porta, gravando no mesmo banco
  que o servidor novo.)

## Radar de promoções (RSS)

`server/flights/promos.ts` lê os feeds dos blogs (cache de 2 h) e casa os posts com cada
monitor por palavras-chave **determinísticas**: cidades, estados, países e regiões das origens e
destinos, nomes em inglês comuns e IATA como palavra inteira. Genéricos como "Brasil" não
contam.

- A aba "Promoções (blogs)" mostra os posts dos últimos 21 dias, os preços citados e o motivo do
  casamento.
- "✨ estruturar" manda o post para a importação por IA, para revisão.
- O agendador avisa posts novos (alerta "post de promoção", 1× por post por monitor).
- Os feeds são configuráveis em Fontes e execução.

O post é um anúncio, não uma cotação: abra e confira datas e regras.

## Importação

O formato JSON é uma lista de objetos (CSV: as mesmas chaves planas, sem `segments`/`return`):

```json
[{
  "origin": "BKK", "destination": "SSA",
  "depart": "2026-12-12T08:05", "arrive": "2026-12-13T06:40",
  "price": 5230.90, "currency": "BRL", "stops": 2, "carrier": "QR", "flight": "833",
  "segments": [{"from": "BKK", "to": "DOH", "depart": "…", "arrive": "…", "carrier": "QR", "flight": "833"}],
  "return": {"depart": "…", "arrive": "…", "segments": []},
  "checked_bags": 1, "carry_on": 1, "refundable": false, "self_transfer": false,
  "link": "https://…", "link_kind": "search", "source": "Alerta X", "observed_at": "2026-11-10"
}]
```

- Horários são locais, no formato `YYYY-MM-DDTHH:MM`.
- Aeroportos desconhecidos e preços inválidos geram erro na linha.
- Campos ausentes ficam desconhecidos.
- Links importados são tratados como links de **pesquisa**, salvo `link_kind: "offer"` explícito.

## Busca de ponta a ponta

1. Em **Fontes e execução**, configure o token da Aviasales (e, se tiver, o da Duffel).
2. Crie um monitor: **+ Novo** ou **✨ Criar com IA**.
   - Escolha países/regiões de origem e o destino.
   - Use **📍 Sugerir aeroportos próximos** para adicionar alternativas; o tempo da rota entra
     no custo total.
   - Defina datas, mala e países proibidos para conexão.
3. **Buscar agora** dispara a execução em segundo plano. O progresso chega ao vivo (SSE
   `flights:updated`).
4. Explore os resultados:
   - filtros, ordenação, ★ favoritos e comparação (2–4 opções);
   - a linha expandida mostra a timeline com conexões, bagagem, riscos e links;
   - as abas mostram **Calendário**, **Histórico**, **Plano e cobertura** e **Alertas**.
5. Ative a atualização (diária, a cada X horas ou adaptativa) em *Avançado → Execução*.

Sem nenhuma fonte configurada, o monitor pode ser criado, editado e receber importações; o botão
de busca fica desativado, com a explicação.

## Testes

```bash
npm test   # tsx --test server/flights/__tests__/*.test.ts  (node:test, sem dependências novas)
```

- **`core.test.ts`** (lógica pura):
  - expansão de país, região, estado e metrópole; exclusões; autocomplete;
  - rejeição de códigos inventados; haversine e aeroportos próximos;
  - janelas de datas e combinações ida/volta;
  - restrições: países de conexão, conexões desconhecidas → pendente, bagagem desconhecida,
    self-transfer, limites, troca de aeroporto, madrugada, preço máximo com câmbio;
  - dinheiro sem float, câmbio sem 1:1, custo total com terrestre;
  - normalização Aviasales e Duffel;
  - fingerprint entre provedores; ranking e diversificação;
  - planejador (corte justo, hubs, mês × amostragem, aprofundamento, sem consulta repetida, cobertura);
  - validação de configuração e importação CSV.
- **`runner.test.ts`** (banco temporário + provedor falso):
  - mesclagem de ofertas e histórico (cache não sobrescreve ao vivo);
  - idempotência do plano e claim exclusivo, recuperação após reinício;
  - orçamento por execução e "continuar" sem repetir; cache entre monitores;
  - timeout → retry com backoff; credencial inválida desliga o provedor;
  - `fetchJson` com 429/500/timeout;
  - página de ofertas, alertas sem duplicar, resumo e cobertura;
  - IA: resposta com códigos inventados é filtrada e nada é salvo.

## Limitações conhecidas

- **Nenhuma fonte ao vivo funciona sem credencial.** Sem token da Aviasales/Duffel, só há
  importação. Os adaptadores seguem a documentação pública, mas não foram exercitados contra a
  API real neste ambiente (sem tokens).
- **Aviasales:**
  - é cache: rotas pouco buscadas podem não ter dados;
  - o preço é por 1 adulto e não considera cabine;
  - não informa bagagem nem aeroportos de conexão, então restrições desse tipo ficam pendentes
    até a validação ao vivo.
- **Duffel:**
  - a conta live exige aprovação;
  - sem reservas, cada busca pode custar ~US$ 0,005;
  - não há link público da oferta (o app mostra links de pesquisa).
- **Transporte terrestre:**
  - o OSRM dá rota de carro, não de ônibus; o custo só aparece se você configurar custo por km
    ou informar manualmente;
  - o servidor público do OSRM não tem garantia de disponibilidade.
- **Alertas** só rodam depois de buscas (agendadas ou manuais); com o servidor desligado, nada
  é verificado.
- **Base de aeroportos:**
  - é estática (gere de novo com `scripts/build-airports.mjs`);
  - "serviço regular" vem do OurAirports e pode estar desatualizado;
  - a lista de hubs é curada.
- **Skyscanner pelo Chrome** não foi exercitado contra o site real nesta sessão (a extensão não
  estava conectada). O prompt e a conversão estão testados; a primeira execução real pode pedir
  ajustes na leitura da página.
- **Fora do escopo:**
  - verificação de visto e trânsito: o app só sinaliza incertezas;
  - calendário de preços de volta (só ida);
  - comparação entre configurações diferentes de passageiros;
  - várias moedas no mesmo gráfico.
