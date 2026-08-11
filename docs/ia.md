# RickOS — Dump de contexto para brainstorm com IA

> **Como usar este arquivo:** cole tudo isto numa IA e peça o que quiser — novas features, priorização, críticas de UX, integrações, modelos de dados. Ele descreve **o que o app já faz hoje**, o modelo de dados, as integrações e as limitações conhecidas, com detalhe suficiente para a IA propor coisas coerentes com a arquitetura.

---

## 0. O que é o app

**RickOS** é um "sistema operacional pessoal" de **desktop, local-first**. Começou como time tracker e virou um painel único que reúne produtividade, projetos, finanças, viagens, estudos e uma camada de IA local. Roda offline; todos os dados ficam num único arquivo SQLite na máquina do usuário. É de uso pessoal (um usuário só).

**Perfil do usuário:** estuda tecnologia e idiomas em ciclos de hiperfoco; trabalha com engenharia/DevOps; quer centralizar tudo num app só em vez de Notion/Obsidian/Anki/planilhas.

### Stack técnica
- **Electron** (main + preload + renderer), empacotado com `electron-vite`.
- **React + TypeScript + Vite** no renderer.
- **sql.js** (SQLite em WebAssembly) como banco — um arquivo `timetracker.db` em `userData`, carregado em memória e persistido a cada escrita.
- **Zustand** para estado (um store por módulo).
- **Sem bibliotecas pesadas**: gráficos, markdown, drag-and-drop, etc. são feitos à mão (CSS/JS puro). Tema escuro.
- **IA**: executa o **Claude Code CLI local** via `child_process` (nada é mandado a APIs pagas pelo app).

### Arquitetura (padrão repetido em toda entidade)
```
UI React → store Zustand → window.api.<ns>.<ação>()  (preload / contextBridge)
        → ipcMain.handle('<ns>:<ação>')              (processo main)
        → queries.ts (sql.js)                          (dados)
```
- Navegação: um `Page` union + `NAV_GROUPS` (sidebar) + registry `PAGES`. `uiStore.currentPage`/`setPage`.
- Segurança: contextIsolation; credenciais sensíveis criptografadas com `safeStorage` do Electron.
- Migrações: `PRAGMA user_version` (7 migrações até hoje). Tabela nova entra no schema; alteração de tabela vira migração.

---

## 1. Time Tracker (o núcleo)

**Conceito central:** o dia é uma **timeline contínua** — o usuário está sempre fazendo algo; ao parar uma tarefa idealmente começa outra (Idle preenche buracos).

**Funcionalidades:**
- **Tarefa ativa** única por vez, com **timer ao vivo** (barra global no topo, presente em todas as páginas). Start / Stop / **Switch** (trocar) instantâneo. Iniciar uma tarefa para automaticamente a anterior.
- **Timeline diária** 00:00–23:59 (1,5px/min): blocos posicionados por horário, **arrastáveis** (mudar horário) e **redimensionáveis** (mudar duração); linha do "agora"; navegação por dia (‹ Hoje ›).
- **Eventos do Google Calendar** aparecem numa **faixa própria** na timeline (multi-dia recortado por dia).
- **Tags**: cada tarefa tem até 2 tags (primária/secundária), cada tag com cor e nível de produtividade (produtivo / semi / improdutivo). Tag "Idle" é o default (id 1).
- **Calendário mensal**: grade com total de horas por dia + **heatmap**; marca dias úteis/banco de horas; mostra hábitos do dia.
- **Estatísticas**: horas por dia/semana/mês, agrupamento por tag, gráficos de barras simples (CSS).
- **Quick-start**: botões dos títulos mais usados do dia. **Fill Gaps**: preenche buracos com Idle e mescla tarefas consecutivas iguais.
- **Modo Pomodoro** (novo): botão 🍅 na barra global. Você define foco/pausa (padrão 25/5) + título + tag; ao iniciar, **cria a task real na timeline** (cresce ao vivo); ao esgotar, para a task (bloco fecha), notifica e entra na **pausa** (task "Pausa ☕" com tag Idle); ao fim da pausa, volta ao ocioso. Estado persistido (sobrevive à navegação/reload); conta ciclos do dia.

**Modelo:** `tasks(id, title, tagId, secondaryTagId, startTime, endTime, studyNodeId)` — endTime NULL = tarefa ativa; `studyNodeId` liga a tarefa a um item do roadmap de Estudos. `tags(id, name, color, isProductive)`.

**Limitações conhecidas:** não há criação automática de Idle ao parar (só no Fill Gaps); merge só por título+tag primária e adjacência exata; `tasks:add` (bloco explícito) não trata sobreposição.

---

## 2. Organização

### Inbox
- Captura rápida (atalho **global** Ctrl/Cmd+Shift+Space, abre modal mesmo com app em segundo plano). Suporta `título // nota`.
- Lista de itens capturados; ao **aprovar**, viram TODO. **Sem categorização automática** (removida a pedido — antes tentava adivinhar viagem/financeiro).
- Campo **`aiGenerated`** e filtro (Todos / 🤖 IA / ✍️ Manual) — preparado para um fluxo futuro de itens gerados por IA.

### TODO
- Tarefas com status (inbox/todo/doing/done), **prioridade** (0–3), **prazo** (com badges atrasada/hoje/futura), **projeto** vinculado, e **notas** (indicador 📝 que abre a edição).
- Busca, filtros por status e por projeto, ordenação (done por último, prioridade, prazo).
- Atalhos de teclado (↑/↓ navegar, espaço concluir, p adiar, e editar).

### Brain Dump ("Despejar minha cabeça")
- Botão grande no dashboard. Textarea grande + **timer de ~5 min**.
- A IA (Claude local) transforma o texto livre em **JSON estruturado**: tarefas (com prioridade/prazo), projetos, próximos passos e **agenda sugerida** (eventos com data/hora).
- Tela de revisão com checkboxes; ao importar, cria de verdade: tarefas/passos → TODO, projetos → Projetos, eventos → Calendário. Roda em background, persiste estado.

### Hábitos
- CRUD de hábitos (diário/semanal, meta). Marcar/desmarcar por dia; **navegação entre dias** (marcar o que esqueceu).
- Grade dos últimos 7 dias por hábito; sequência (streak) e taxa semanal.
- **Estatísticas mensais** (planilha dias × hábitos) + insights por dia da semana (ex.: "sábados 50%, terças 100%"), melhor/pior dia.

### Base de Conhecimento
- Um documento Markdown (perfil/preferências) usado como contexto para a IA. Editor textarea; extrai bullets.

---

## 3. Estudos (Learning OS)

Fluxo: **Tópico → Roadmap → Anotações → Flashcards → Revisão → Progresso.** Substitui Notion/Obsidian/Anki para estudo.

- **Tópicos**: nome, categoria, status (estudando/planejado/pausado/concluído), prioridade, cor, meta (data). Dashboard com progresso do roadmap, contagem de flashcards e revisões pendentes.
- **Roadmap em árvore** (workspace de 3 colunas): nós hierárquicos com status (○ todo → ◑ doing → ● done ciclável), progresso por seção e do tópico, +sub/+irmão, **drag-and-drop** (reordenar e reparentar, com proteção anti-ciclo) e ↑/↓ para ajuste fino.
- **Anotações em Markdown** por nó (ou do tópico): editor com **preview lado a lado** ao vivo (renderer de markdown caseiro: títulos, negrito, itálico, código, listas, citações, links), autosave.
- **IA-tutor na nota**: botões "🧒 Explique simples", "📝 Resuma", "🏋️ Exercício", "🕳️ O que falta" (Claude local) com opção de **anexar o resultado à nota**.
- **Flashcards**: CRUD manual (frente/verso) + **✨ gerar da nota** por IA (revisar/selecionar antes de salvar). Lista mostra a **data da próxima revisão**.
- **Revisão espaçada (SM-2 completo)**: fila de cartões vencidos, botões Again/Hard/Good/Easy que agendam o próximo intervalo (fórmula de ease canônica, 1d→6d→×EF, lapso preserva ease). **Filtro por categoria** (ex.: revisar tudo menos Japonês), persistido.
- **Quiz automático**: gera múltipla escolha das anotações do tópico (IA), você responde, recebe % + correção, e salva **histórico** por tópico.
- **Busca**: textual em tópicos, roadmap, anotações e flashcards (com snippet; clicar abre o item).
- **Export/Import**: caderno `.md` (notas na ordem do roadmap), backup JSON por tópico, e **pasta Markdown estilo Obsidian** (roadmap.json + um .md por nó). Import recria sem colidir ids.

**Modelo:** `study_topics`, `study_nodes` (self-ref parentId + orderIndex), `study_notes` (por nó), `study_flashcards` (com campos SM-2: easeFactor/intervalDays/repetitions/nextReviewAt), `study_quiz_attempts`.

**Dispensado pelo usuário:** integração com o Time Tracker (horas por tópico), export PDF, busca semântica (FTS5/embeddings), templates de roadmap.

---

## 4. Finanças

- **Contas** (saldo por moeda), **Transações** (receita/despesa, categoria, moeda, data), **import de CSV** de banco (auto-detecção de delimitador/colunas + auto-categorização por palavra-chave).
- **Orçamento** por categoria/mês; dashboard com receitas/gastos do mês, top categorias, **evolução de gastos (6 meses)** e saldo em moeda base.
- **Investimentos com histórico mensal**: registra o valor de cada investimento mês a mês (carry-forward), card "Investimentos em {base}" com variação vs. mês anterior e **gráfico de evolução do portfólio (6 meses)**.
- **Câmbio manual** (moeda base + taxas), conversão para a base. **Modo privacidade** (👁) mascara todos os valores (persistido).
- **Open Finance via Pluggy**: conectar banco (Pluggy Connect), importar transações (dedup por data+valor+descrição), credenciais criptografadas. Endpoint v2 com paginação por cursor.
- Multi-moeda (BRL padrão), relatórios, export CSV de transações.

**Modelo:** `accounts`, `categories`, `transactions`, `budgets`, `investments`, `investment_history(investmentId, month, amount)`.

---

## 5. Viagens

- **Viagens** (origem/destino, datas, orçamento, moeda, status).
- **Monitoramento de voos**: busca preço via **Skyscanner (RapidAPI)**, watches por rota, refresh de preço; moeda BRL padrão.
- **Destinos**, **Documentos** (por viagem) e **Recomendações**.

---

## 6. Projetos + GitHub

- **Projetos**: nome, descrição, cor, **URL do repo GitHub**, comando Claude por projeto, arquivar.
- **Issues (Kanban)**: colunas backlog/em-andamento/bloqueado/concluído a partir de labels/estado. Sincroniza issues do **GitHub** (token ou **SSH** da máquina). Cria issue **local** e depois envia ao GitHub via Claude. **Multiselect de projetos** (filtrar por vários repos; arquivados não aparecem). Filtro de "concluídas" por período. Data da última sincronização.

**Modelo:** `projects`, `github_issues` (com flag `local` e `body`).

---

## 7. IA (Claude Code local)

- **Assistente**: prompts pré-definidos (priorizar, revisar inbox, planejar semana, roteiro de viagem, resumo semanal…) que **preenchem** o campo (sobrescrevíveis) e executam via Claude local; roda em **background** (sobrevive à navegação), com cancelar.
- **Skills** e **Agentes**: biblioteca CRUD com busca/filtros/favoritos, tags, export/import `.json` por entidade, "mais usada", seeds de exemplo. Agente tem system prompt + skills padrão.
- **Prompt Runner**: **abas paralelas** (nomeáveis), compõe `agente + skills + prompt`, preview do prompt final, copiar/salvar/**executar aqui** (streaming ao vivo do texto/pensamento/ferramentas, **sem timeout**). Selecionar agente **filtra as skills dele** (com "ver todas"). Selecionar projeto injeta contexto do repo. **Cores de status nas abas** (running / concluída não vista). Cancelar execução.
- **Histórico** de execuções (reabrir no runner, duplicar, excluir, copiar).
- Execução: `services/claude.ts` faz `spawn` do CLI; suporta `--allowedTools` (configurável), streaming `--output-format stream-json`, resolução do comando por projeto.

**Modelo:** `skills`, `agents`, `prompt_executions` (ids TEXT uuid para export/merge entre máquinas).

---

## 8. Configurações & Links

- **Integrações**: GitHub (token/SSH), **Google Calendar multi-conta** (OAuth loopback, sync automático 1×/dia, escopo Drive para backup), Pluggy, Skyscanner, comando e **ferramentas permitidas** do Claude. Mostra **data/hora da última sincronização** de cada uma.
- **Backup**: exportar/importar o banco `.sqlite` completo — **local** ou direto para o **Google Drive**.
- **Links**: lista com **tags** (várias por link), filtro por tag, checkbox persistido, "abrir marcados" e **"abrir por tag"**; abre no navegador padrão.

---

## 9. Capacidades transversais

- **Backup completo** num arquivo (SQLite) → export local ou Google Drive.
- **Execuções de IA em background** que sobrevivem à navegação, com streaming e cancelamento.
- **Persistência de rascunhos/estado** em `localStorage` (`rickos:*`) em vários módulos.
- **Atalhos globais** e por página.
- **Tema escuro**, UI responsiva por grid/flex, sem framework de CSS.

---

## 9.1 Módulos e features adicionados depois (importante)

Muita coisa foi construída após a 1ª versão deste dump. Resumo do que já existe hoje (não sugerir de novo):

**Organização**
- **Brain Dump** ("Despejar minha cabeça"): texto livre → IA vira tarefas/projetos/passos/agenda; revisão com checkboxes → importa de verdade.
- **Metas mensais** (`🎯`): metas por mês, livres ou ligadas a um projeto/tópico de estudo, com progresso e navegação por mês.
- **Automações** (`⚡`): **motor de regras condição→ação** avaliado no processo main a cada 1 min (sem foco produtivo por X min no horário; gasto de categoria > P% do orçamento; flashcards vencidos > N → notificação nativa / cria TODO) **+ agendador de agentes → Inbox** (roda o Claude no horário definido e o resultado vira item de Inbox com `aiGenerated=1`).
- **Revisão semanal** (`🗓️`): wizard guiado (inbox zero → TODOs zumbis → hábitos → finanças → plano) com rascunho da IA por etapa.
- **TODO**: recorrências (a cada N dias / dia X do mês / N dias após concluir — próxima instância nasce ao concluir) e indicador de idade ("há X"); campo `aiGenerated` + filtro no Inbox.
- **Inbox por OCR**: arrastar/colar print/boleto/foto → Claude local (multimodal, ferramenta Read) extrai título/valor/data/link/nota → item de Inbox.

**Estudos (Learning OS)** — já descrito na seção 3; adições: IA-tutor na nota agora inclui **Tutor Socrático** (só perguntas graduais) e **Revisão Ativa** ("explique sem olhar"); **Detector de Lacunas** no roadmap (IA aponta pré-requisitos faltando); **Quiz automático** com histórico; SM-2 completo; drag-and-drop no roadmap; filtro de revisão por categoria.

**Ponte Time Tracker × Estudos**: uma tarefa pode ser vinculada a um item do roadmap (`tasks.studyNodeId`); a timeline mostra 📖 e o Dashboard de Estudos soma **horas de foco por tópico**.

**Time Tracker**: **modo Pomodoro** (cria a task na timeline; foco→pausa) e **overlay de hábitos** na timeline (marca o horário 🔥 em que o hábito foi concluído).

**Home**: **Daily Standup / briefing matinal** (IA junta TODOs de hoje/atrasados, flashcards vencidos, eventos e horas de ontem → resumo + agenda time-boxed).

**Projetos**: **Resumo de progresso** (semana/mês) por commits+issues via `gh` com o Claude local.

**CRM Pessoal / Relationship OS** (`🤝 Pessoas`): contatos com local/aniversário/interesses/contexto/última conversa/follow-up; ordena "precisam de atenção"; IA sugere mensagens de reconexão puxando o gancho do contexto.

**Travel Stay Finder** (`🏨 Hospedagens`): busca multi-plataforma (arquitetura de provedores; mock funcional + Booking/Agoda/Trip/Airbnb stub); filtros completos; score/dedup/distância/datas flexíveis; mapa de pins (SVG, sem lib); favoritos, monitoramento de preço, histórico; recomendação da IA com base num perfil de viagem.

**Finanças**: relatório cobre todos os meses com movimento desde 2015 (pula zerados); investimentos com histórico mensal; modo privacidade.

**Backup**: snapshots automáticos diários do banco (mantém 3) com restaurar em Configurações.

---

## 10. Limitações / o que NÃO existe hoje (oportunidades)

- Nenhuma sincronização em nuvem/multi-dispositivo (só backup manual em arquivo/Drive + snapshots diários locais).
- Sem multiusuário, sem autenticação.
- Os motores de automação (regras + agendador) rodam **só com o app aberto** — não há execução headless com o app fechado.
- Busca é textual (substring), não semântica; sem FTS5/embeddings.
- Sem mobile/web; desktop apenas.
- Sem relatórios/cadernos exportáveis em **PDF** (só `.md`/JSON/CSV).
- Sem gráficos avançados nem mapa real com tiles (barras/scatter em CSS/SVG puro).
- IA depende do Claude Code CLI instalado localmente.
- Provedores de hospedagem reais ainda são mock (sem API oficial integrada).
- Sem versionamento de prompts/skills nem execução de agentes com tool-use além do `--allowedTools`.

---

## 11. Prompt sugerido para a IA

> "Este é o RickOS, meu app pessoal de desktop (contexto acima). Quero que você atue como product strategist. Com base no que ele já faz e no perfil do usuário (estudo em hiperfoco, engenharia/DevOps, quer centralizar a vida num app), sugira **10 features novas de alto impacto** que aproveitem a arquitetura existente (Electron/React/sql.js/Zustand + Claude local, sem libs pesadas, local-first). Para cada uma: problema que resolve, esboço de UX, modelo de dados/tabelas necessárias, integrações, e esforço estimado (P/M/G). Priorize o que conecta módulos que hoje são ilhas (ex.: Time Tracker × Estudos × Finanças) e o que usa a IA local de forma criativa. Evite sugerir o que já existe."
