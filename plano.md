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
- [ ] Refinar Quick Capture: parsing leve ("comprar passagem Osaka→Kumamoto" → sugerir viagem), notas rápidas. *(depende do módulo Viagens)*
- [ ] Processar Inbox direto p/ Viagem ou Financeiro. *(depende desses módulos)*
- [ ] Atalhos de teclado para completar/adiar direto na lista.

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
- [ ] Sync **incremental** por `updated_at` (hoje é full-replace de até 100 issues).
- [ ] Guardar token com `safeStorage` do Electron (hoje é texto no `.db` local).
- [ ] Vincular issues ↔ projeto (hoje o Kanban lista todas as issues atribuídas, não filtra por projeto).
- [ ] Paginação (>100 issues).

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

## 4. Hábitos  *(prioridade #4)*

**Fundação:** tabelas `habits`/`habit_entries` + CRUD + toggle diário já existem.

Próximos passos:
- [ ] Streak real (sequência de dias) e taxa semanal por hábito.
- [ ] Frequência/target além de diário (semanal, X vezes por semana).
- [ ] Grade semanal/mensal (heatmap por hábito).
- [ ] Hábitos padrão sugeridos (academia, japonês, meditar, dormir <00:00, sem álcool, revisar TODO).
- [ ] Editar hábito (nome, frequência, ativo/inativo).

## 5. Calendário (Google Calendar — leitura)  *(prioridade #5)*

- [ ] OAuth Google (fluxo desktop) + guardar refresh token.
- [ ] Listar próximos 7 dias; cache local.
- [ ] Exibir reuniões no Dashboard e no calendário existente do tracker.
- [ ] Sem editar eventos no MVP.

## 6. Finanças  *(prioridade #6)*

**Fundação:** tabelas `accounts`, `categories`, `transactions`, `budgets`, `investments` já existem (páginas placeholder).

Próximos passos:
- [ ] CRUD de contas, categorias, transações (multi-moeda BRL/JPY/USD).
- [ ] **Importar CSV** Nubank/Inter/Wise (parser por banco) + processo reverso (exportar).
- [ ] Orçamento mensal por categoria; alerta de estouro.
- [ ] Relatórios mensais (evolução, top categorias, meta).
- [ ] Dashboard financeiro: saldo total, gastos do mês, top categorias, evolução, meta.
- [ ] Ver app do Gabriel / export do Sheets como referência de importação.
- [ ] Sem Open Finance agora.

## 7. Viagens  *(prioridade #7)*

**Fundação:** tabelas `trips`, `flight_watches` + mock JSON já existem.

Próximos passos:
- [ ] CRUD de viagem (origem, destino, datas, orçamento, status).
- [ ] Monitoramento de passagens (por ora mock JSON; depois fonte real).
- [ ] Recomendações por gosto a partir de `user-profile.md` (café, anime, vida noturna, ramen/izakaya, bairros caminháveis).
- [ ] Checklist de documentos por viagem (passaporte, visto, vacina, seguro, hospedagem) — hoje é mock estático.
- [ ] Destinos salvos.

## 8. IA local (Claude Code CLI)  *(prioridade #8)*

- [ ] `src/modules/ai/services/claude.ts` — executar `claude -p "..."` via `child_process` (nada em API paga direta).
- [ ] Casos de uso: roteiro de viagem, checklist, resumo semanal, priorização de tarefas, revisão da inbox, planejamento da semana.

---

## 🧾 Dívidas / itens do TODO.TXT antigo

- [ ] Banco de horas: 8h por dia útil, tratar feriados; mostrar saldo do dia no calendário (ex.: +3, -2). *(WIP em `day_configs`/`Dashboard.tsx`/`queries.ts`)*
- [ ] "Semi productive" para hk e velt.
- [ ] Integrar com calendário (ver #5).
- [ ] Integrar IA para sugestões (ver #8).

## 🛠 Técnico / higiene

- [ ] Sistema de migração leve (hoje é `CREATE TABLE IF NOT EXISTS` + `ALTER` em try/catch no `db.ts`) — avaliar quando colunas mudarem muito.
- [ ] Persistir configurações (tokens GitHub/Google) — tabela `settings` ou arquivo em `userData`.
- [ ] Mover time-tracker existente para `src/modules/timetracker/` quando o WIP estabilizar (opcional).
- [ ] Overflow/scroll da sidebar já tratado; revisar responsividade com muitos itens.
