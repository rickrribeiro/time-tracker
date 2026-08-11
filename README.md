# RickOS — Personal OS (Local-First Desktop App)

Um "sistema operacional pessoal" de mesa, **local-first**: começou como time tracker e cresceu para um painel único que reúne organização, projetos/GitHub, finanças, viagens, estudos (Learning OS) e uma camada de IA que roda o **Claude Code local**. Tudo roda offline; os dados ficam num único arquivo SQLite na sua máquina.

> Stack: **Electron + React + TypeScript + Vite + sql.js (SQLite em WASM) + Zustand**. Sem backend, sem nuvem obrigatória, sem bibliotecas pesadas de UI.

---

## ✨ Módulos

| Grupo | O que faz |
|-------|-----------|
| **🏠 Dashboard** | Visão do dia: tarefa ativa, top tarefas, hábitos, horas da semana, próxima viagem, e o botão **🧠 Despejar minha cabeça** (brain dump → IA vira tarefas/projetos/agenda). |
| **⏱ Time Tracker** | Timeline contínua 00:00–23:59 com blocos arrastáveis/redimensionáveis, tarefa ativa com timer, tags (com produtividade), calendário mensal com heatmap, estatísticas, e **modo Pomodoro** que cria a task na timeline. |
| **🗂 Organização** | Inbox (captura rápida, atalho global), TODO (prioridade/prazo/projeto, notas), Brain Dump, Hábitos (grade mensal + insights, navegação por dia), Base de Conhecimento. |
| **🎓 Estudos (Learning OS)** | Tópicos → roadmap em árvore (drag-and-drop) → anotações em Markdown (editor + preview) → flashcards (manuais ou gerados por IA) → revisão espaçada **SM-2** → quiz automático → busca → export (caderno `.md`, JSON, pasta Obsidian). |
| **💰 Finanças** | Contas, transações (import CSV), orçamento, investimentos com **histórico mensal e gráfico de evolução**, relatórios, câmbio manual, modo privacidade (ocultar valores), e Open Finance via **Pluggy**. |
| **✈️ Viagens** | Viagens, monitoramento de preços de voos (Skyscanner/RapidAPI), destinos, documentos e recomendações. |
| **📌 Projetos** | Projetos + Issues (Kanban) sincronizados com o **GitHub** (token ou SSH), criação de issues via Claude local. |
| **🤖 IA** | Assistente, biblioteca de **Skills** e **Agentes**, **Prompt Runner** (abas paralelas, executa via Claude local com streaming), e Histórico de execuções. |
| **⚙️ Configurações / 🔗 Links** | Integrações (GitHub, Google Calendar multi-conta, Pluggy, Skyscanner, comando/ferramentas do Claude) e uma lista de links com tags/filtros e "abrir marcados/por tag". |

---

## 🚀 Começando

Pré-requisitos: **Node.js 18+** e npm. Para os recursos de IA, o **Claude Code CLI** instalado (`claude`).

```bash
npm install
npm run dev      # abre o app em modo desenvolvimento
```

Build de produção:

```bash
npm run build            # typecheck + bundle (main/preload/renderer)
npm run preview          # pré-visualiza o build
npx electron-builder     # empacota o app (saída em release/)
```

> ⚠️ Mudanças no **processo principal ou no preload** (`electron/`) exigem **reiniciar o `npm run dev`** — o hot-reload cobre só o renderer.

---

## 🧱 Arquitetura

```
electron/
  main/
    index.ts            # bootstrap, janela, TODOS os ipcMain.handle
    database/
      schema.ts         # SCHEMA: CREATE TABLE IF NOT EXISTS (roda todo boot)
      db.ts             # sql.js init + migrações (PRAGMA user_version) + seeds
      queries.ts        # CRUD por entidade (helpers getDb/getAll/getOne/run)
      aiSeeds.ts        # skills/agentes de exemplo
    services/           # integrações externas (efeitos colaterais)
      claude.ts         # roda o Claude Code CLI (spawn, streaming)
      github.ts  google.ts  pluggy.ts  flights.ts  secrets.ts
  preload/
    index.ts            # contextBridge → window.api.* (única ponte IPC)
src/
  App.tsx               # NAV_GROUPS + registry PAGES (Record<Page, Component>)
  types/index.ts        # interfaces + Page union + tipagem de window.api
  store/                # stores globais (uiStore: currentPage)
  utils/                # helpers de data
  modules/<módulo>/
    pages/  components/  store/   # cada módulo é autocontido (Zustand)
  index.css             # estilos (tema escuro, sem framework de CSS)
```

**Fluxo de dados (padrão em toda entidade):**

```
UI (React) → store Zustand → window.api.<ns>.<ação>()   [preload]
           → ipcMain.handle('<ns>:<ação>')              [main]
           → queries.ts (sql.js)                         [dados]
```

- **Uma fonte de verdade**: todo o banco vive num único arquivo em `app.getPath('userData')/timetracker.db` (sql.js em memória, persistido em disco após cada escrita).
- **Segurança**: `contextIsolation` + preload; nada de Node no renderer. Credenciais sensíveis são criptografadas com o `safeStorage` do Electron (`services/secrets.ts`).
- **Migrações**: tabela nova entra só no `schema.ts`; alteração de tabela existente ganha uma entrada em `MIGRATIONS` (`db.ts`), versionada por `PRAGMA user_version`.

---

## 🤖 Integração com IA (Claude Code local)

Os recursos de IA (Assistente, Prompt Runner, Brain Dump, geração de flashcards, IA-tutor, quiz) executam o **Claude Code CLI** na sua máquina via `child_process` (`services/claude.ts`) — nada é enviado a APIs pagas diretamente pelo app.

- Execuções rodam em **background no processo principal** (sobrevivem à navegação) com **streaming** ao vivo (texto, pensamento e uso de ferramentas).
- Configurável em **Configurações → IA**: o comando (`claude` por padrão, ou um alias) e as **ferramentas permitidas** (ex.: `Bash(gh:*) Bash(git:*) Read Write Edit`).
- Ao selecionar um projeto no Prompt Runner, o contexto do repositório é injetado no prompt (ex.: usar `gh --repo owner/repo`).

---

## 🔌 Integrações externas (opcionais)

Todas configuráveis em **Configurações**; o app funciona 100% sem elas.

| Integração | Uso | Observação |
|-----------|-----|-----------|
| **GitHub** | Issues (Kanban) + criar issues via Claude | Token ou SSH da máquina |
| **Google Calendar** | Eventos na timeline/dashboard | OAuth, **multi-conta**, sync automático 1×/dia |
| **Pluggy (Open Finance)** | Importar transações bancárias | Client ID/Secret + Pluggy Connect |
| **Skyscanner (RapidAPI)** | Preços de voos | Requer assinar a API no RapidAPI |

A data/hora da última sincronização de cada integração aparece em Configurações.

---

## 💾 Backup e dados

- **Exportar/Importar banco** (botões na sidebar): snapshot `.sqlite` completo — **localmente** ou direto para o **Google Drive**.
- **Estudos**: export por tópico como caderno `.md`, backup JSON ou pasta Markdown (compatível com Obsidian).
- Como tudo é um arquivo SQLite, o backup completo já inclui todos os módulos.

---

## ⌨️ Atalhos

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + Shift + Space` | Captura rápida (Inbox) — global |
| `Ctrl/Cmd + Space` | Parar tarefa ativa |
| `Ctrl/Cmd + 1–4` | Navegar entre páginas principais |
| No TODO | `↑/↓` navegar · `espaço` concluir · `p` adiar · `e` editar |

---

## 🛠 Desenvolvimento

Typecheck (nunca use `tsc -b`; os projetos são separados):

```bash
npx tsc -p tsconfig.node.json --noEmit   # processo main/preload
npx tsc -p tsconfig.web.json  --noEmit   # renderer (React)
npm run build                            # bundle completo
```

**Convenções**
- Ao adicionar uma entidade, toque nos 6 pontos: `schema.ts` → `queries.ts` → `index.ts` (IPC) → `preload/index.ts` → `types/index.ts` (interface + `Page` + `window.api`) → store Zustand. Molde: `todos`/`habits`.
- Nova página: registre em `NAV_GROUPS` **e** no `PAGES` (o `Record<Page, …>` obriga a sincronia via TS).
- sql.js **não** aceita parâmetros em `db.exec` — sempre `prepare/step` (helpers `getAll/getOne/run`).
- Sem bibliotecas pesadas (charts, markdown, DnD são feitos à mão, em CSS/JS puro).

---

## 📦 Stack e por quê

- **Electron** — app de mesa multiplataforma.
- **React + TypeScript + Vite** (via `electron-vite`) — UI tipada e build rápido.
- **sql.js** — SQLite em WebAssembly, sem dependência nativa (nada de recompilar por plataforma).
- **Zustand** — estado global mínimo, um store por módulo.

---

## 📄 Licença

Projeto pessoal. Uso interno.
