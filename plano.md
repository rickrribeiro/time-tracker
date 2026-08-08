# RickOS — Plano de Evolução

> TimeTracker → sistema pessoal modular (trabalho, organização, finanças, viagens, hábitos).
> Stack fixa: **Electron + React + TS + Vite + sql.js + Zustand**. Sem Prisma. Integrações reais só quando houver token/OAuth.

---

## ✅ Fundação (feito)

- Sidebar modular agrupada (`NAV_GROUPS`) + page registry em `src/App.tsx`.
- Estrutura `src/modules/<mod>/{pages,store,components}`.
- **Schema completo** em `electron/main/database/schema.ts`: `projects`, `todos`, `habits`, `habit_entries`, `accounts`, `categories`, `transactions`, `budgets`, `investments`, `trips`, `flight_watches`.
- CRUD ponta-a-ponta (schema → queries → IPC → preload → types → store → página) para **Todos/Inbox**, **Projects**, **Habits**.
- Quick Capture global (`Ctrl/Cmd+Shift+Space`) → Inbox.
- Home ("Hoje") com horas da semana + tarefas + hábitos reais; finanças/viagens mockados.
- `resolveJsonModule: true` no `tsconfig.web.json` (para mocks JSON).

**Padrão para adicionar tabela/entidade (repetir sempre):** `schema.ts` → `queries.ts` (interface `Db*` + funções usando `getDb/getAll/getOne/run/lastInsertId`) → `electron/main/index.ts` (`ipcMain.handle`) → `electron/preload/index.ts` (bloco no `api`) → `src/types/index.ts` (interface + augment `Window.api`) → store Zustand → página. Molde: `createTag`.

---

## 🔥 Priorização brutal (ordem de execução)

1. Inbox/TODO
2. Projetos + GitHub
3. Dashboard
4. Hábitos
5. Calendário
6. Finanças
7. Viagens
8. IA

> Se faltar tempo, **não abrir mão dos 4 primeiros**.

---

## 1. Inbox / TODO  *(prioridade #1 — em grande parte FEITO)*

**Fundação:** tabela `todos` + CRUD + Quick Capture já existem.

Feito:
- [x] Editor completo de tarefa (título, notas, prioridade, dueDate, projeto, status) — `TodoEditor` modal, reutilizado no TODO e no Inbox.
- [x] Prioridade visual (Nenhuma/Baixa/Média/Alta) com dot clicável (cicla) + ordenação por prioridade.
- [x] Data de vencimento (`dueDate`) com destaque **Atrasada / Hoje / futura**.
- [x] Vincular tarefa a projeto (`projectId`) — dropdown de projetos + chip na lista.
- [x] Fluxo de processamento da Inbox: **→ TODO** rápido + **Processar…** (editor com projeto/prioridade/status).
- [x] Filtros/busca (busca texto, status, projeto) + ordenação (done por último, prioridade, vencimento).

Restante:
- [x] Refinar Quick Capture: parsing leve (`parse.ts` — `//` para nota rápida, `A→B` para trecho, sugestão viagem/financeiro/tarefa por palavra-chave/moeda) + hint ao vivo.
- [x] Processar Inbox direto p/ **Viagem** (cria trip, extrai A→B e orçamento) ou **Financeiro** (cria transação "Outros", extrai valor); botão da sugestão vem destacado.
- [x] Atalhos de teclado na lista do TODO: ↑↓ navegar, espaço concluir, `p` adiar (+1 dia), `e` editar; linha selecionada destacada.

## 2. Projetos + GitHub  *(prioridade #2 — FEITO no MVP)*

**Fundação:** tabela `projects` + CRUD já existem.

Feito:
- [x] Tela **Configurações** com GitHub token + username, salvos na tabela `settings` (key-value, em `userData`).
- [x] Serviço real `electron/main/services/github.ts` — REST API v3 (`/issues?filter=assigned&state=all`), headers com token, tratamento de 401/erros.
- [x] Botão **Sincronizar Issues** (em Configurações e no Kanban) — puxa assigned, repo, labels, milestone, updated_at.
- [x] Tabela `github_issues` (read-only mirror; full-replace a cada sync).
- [x] **Kanban** `Issues (Kanban)`: Backlog | Em andamento | Bloqueado | Concluído — colunas derivadas de state+labels; cards abrem no GitHub (`app.openExternal`).
- [x] Editar/arquivar/desarquivar projeto; associar repo (campo `githubRepoUrl`).
- [x] **Projetos** virou categoria própria no sidebar (Projetos + Issues).

Restante / melhorias:
- [x] Sync **incremental** por `updated_at`: 1ª sync = full replace; seguintes passam `since=<último sync>` e fazem merge (upsert), preservando histórico. `github_last_sync` em settings.
- [x] Guardar token com `safeStorage` do Electron (feito na seção Técnico/higiene — `services/secrets.ts`).
- [x] Vincular issues ↔ projeto: filtro do Kanban por projeto (casa `issue.repo` com o `githubRepoUrl` do projeto via `repoFromUrl`).
- [x] Paginação (>100 issues): segue o header `Link: rel="next"` (cap de 10 páginas ≈ 1000 issues).

> ⚠️ Requer o usuário colar um **Personal Access Token (classic, escopo `repo`)** em Configurações para funcionar. Sem token, o Kanban mostra estado vazio com instruções.

## 3. Dashboard "Hoje"  *(prioridade #3 — FEITO)*

**Fundação:** HomePage com horas/tarefas/hábitos reais + cards mock.

Feito:
- [x] Seção **Hoje**: timer ativo (taskStore), top 3 tarefas (por prioridade), hábitos pendentes, inbox pendente.
- [x] Seção **Esta semana**: horas trabalhadas (stats.daily), tarefas abertas, hábitos do dia, **issues GitHub abertas (real)**.
- [x] Seção **Próxima viagem** (mock por enquanto).

Restante (cablear quando os módulos entrarem):
- [ ] Próxima reunião (depende do Calendário #5).
- [ ] Gastos do mês (depende de Finanças #6).
- [ ] Próxima viagem real (depende de Viagens #7).

## 4. Hábitos  *(prioridade #4 — FEITO)*

**Fundação:** tabelas `habits`/`habit_entries` + CRUD + toggle diário já existem.

Feito:
- [x] **Streak** (sequência de dias) e **taxa semanal** (x/7) por hábito — via `getHabitEntriesRange`.
- [x] Frequência/target (diária/semanal + meta) editáveis.
- [x] **Grade de 7 dias** (heatmap) por hábito.
- [x] Hábitos padrão sugeridos (academia, japonês, meditar, dormir <00:00, sem álcool, revisar TODO).
- [x] Editar hábito (nome, frequência, meta, ativo/inativo).

## 5. Calendário  *(prioridade #5 — base FEITA, OAuth adiado)*

Feito:
- [x] Tabela `calendar_events` + CRUD (upcoming/range/create/delete) + IPC/preload/types + `calendarStore`.
- [x] **Próximas reuniões** no Dashboard (adicionar/remover manualmente) + card "Próxima reunião" real.
- [x] Row "Google Calendar (em breve)" nas Configurações.

Restante:
- [ ] **OAuth Google** (fluxo desktop) + refresh token — precisa de client ID/secret.
- [ ] Sync automático dos próximos 7 dias (source='google').
- [ ] Overlay de eventos no calendário mensal do time-tracker.

## 6. Finanças  *(prioridade #6 — FEITO no MVP)*

**Fundação:** tabelas `accounts`, `categories`, `transactions`, `budgets`, `investments` já existem.

Feito:
- [x] CRUD de contas, categorias (6 seed), transações e investimentos (multi-moeda BRL/USD/JPY/EUR).
- [x] **Importar CSV** genérico (auto-detecta delimitador + colunas; testado Nubank e Inter) + **Exportar CSV**.
- [x] Orçamento mensal por categoria com barra e **alerta de estouro**.
- [x] Relatórios mensais (tabela receitas/despesas/saldo, 6 meses).
- [x] Dashboard financeiro: saldo por conta, receitas/gastos do mês, top categorias, evolução 6 meses, meta.
- [x] Navegação por mês (MonthNav) em todas as telas.

Restante / melhorias:
- [ ] Parsers específicos por banco (Wise, cartões) e mapeamento de categorias na importação (hoje entra tudo em "Outros").
- [ ] Conversão entre moedas (hoje soma por moeda separadamente).
- [ ] Editar transação inline (hoje: criar/excluir).
- [ ] Sem Open Finance (mantido fora de escopo).

## 7. Viagens  *(prioridade #7 — FEITO no MVP)*

**Fundação:** tabelas `trips`, `flight_watches` + mock JSON já existem.

Feito:
- [x] CRUD de viagem (origem, destino, datas, orçamento, status) + dias restantes.
- [x] Monitoramento de passagens: CRUD real de `flight_watches` (trecho + menor preço + data).
- [x] Recomendações a partir de `user-profile.md` (import `?raw`), casadas por interesse.
- [x] Checklist de documentos (interativo, estado local).
- [x] Destinos (derivados das viagens).

Restante / melhorias:
- [ ] Busca automática de preços de passagem (fonte real / API).
- [ ] Persistir checklist de documentos por viagem.
- [ ] Recomendações geradas por IA (ver #8).

## 8. IA local (Claude Code CLI)  *(prioridade #8 — FEITO)*

Feito:
- [x] `electron/main/services/claude.ts` — executa `claude -p "<prompt>"` via `spawn` (sem shell, sem injeção), PATH aumentado (acha `claude` em /opt/homebrew/bin etc.), timeout 120s, erro amigável se não instalado.
- [x] IPC `ai:run` + `ai.run` no preload/types.
- [x] Página **IA** com ações rápidas que usam dados reais do app: **Priorizar tarefas**, **Revisar inbox**, **Planejar a semana**, **Roteiro de viagem** + prompt livre e área de resposta.

Restante / melhorias:
- [ ] Streaming da resposta (hoje retorna tudo ao final).
- [ ] Escolher modelo / `--model`.
- [ ] Mais ações (resumo semanal com horas do tracker, checklist de viagem).

---

## 🧾 Dívidas / itens do TODO.TXT antigo

- [ ] Banco de horas: 8h por dia útil, tratar feriados; mostrar saldo do dia no calendário (ex.: +3, -2). *(WIP em `day_configs`/`Dashboard.tsx`/`queries.ts`)*
- [ ] "Semi productive" para hk e velt.
- [ ] Integrar com calendário (ver #5).
- [ ] Integrar IA para sugestões (ver #8).

## 🛠 Técnico / higiene

- [x] Sistema de migração leve baseado em `PRAGMA user_version` no `db.ts` (array `MIGRATIONS`, cada uma idempotente). O `ALTER` de `secondaryTagId` virou a migração v1.
- [x] Persistir configurações na tabela `settings`; tokens sensíveis (`github_token`) **cifrados com `safeStorage`** (helpers em `services/secrets.ts`, com fallback texto e retrocompatibilidade).
- [x] Time-tracker movido para `src/modules/timetracker/` (components/pages/store). Refs globais via alias `@/` (types, utils, store/uiStore). `uiStore` e `utils/dates` seguem globais.
- [x] Sidebar responsiva com muitos itens: logo/atalhos/rodapé com `flex-shrink:0` (só a `nav-list` rola) + scrollbar fina estilizada.
