# rickOS — guia para agentes

"Sistema operacional pessoal" local-first de um usuário só: time tracker, TODO/Inbox, hábitos, estudos (flashcards SM-2), finanças, viagens, CRM, projetos/GitHub e uma camada de IA que roda o **Claude Code CLI local**. UI e commits em **pt-BR**.

Stack: Electron + React 18 + TypeScript + Vite (`electron-vite`) · servidor **Fastify** · **sql.js** (SQLite em WASM) · **Zustand**. Sem libs pesadas de UI: gráficos, markdown e drag-and-drop são feitos à mão.

## Comandos

```bash
npm run dev        # desktop (Electron); o main sobe o servidor embutido em :4318
npm run dev:web    # servidor (tsx watch) + Vite em http://127.0.0.1:5317
npx tsc -p tsconfig.node.json --noEmit   # typecheck servidor + electron
npx tsc -p tsconfig.web.json  --noEmit   # typecheck front
npm run build:web && npm start           # produção web (dist/ + dist-server/)
npm run screenshots                      # prints desktop×celular×skins em docs/screenshots/ (exige dev:web rodando)
```

* Testes automatizados só no monitoramento de passagens: `npm test` (`node:test` via tsx, em `server/flights/__tests__/`). No resto, a verificação é typecheck + uso real.
* **Nunca** use `tsc -b` nem `tsc` sem `--noEmit`: ele gera `.js` ao lado dos fontes.
* Mudou `server/` ou `electron/`? Reinicie o `npm run dev`. O `dev:web` recarrega o servidor sozinho.

## Arquitetura

Desktop e web/celular (PWA) são **dois clientes do mesmo servidor e do mesmo banco**.

```
UI React → store Zustand → window.api.<ns>.<ação>()   src/api/createApi.ts
         → POST /api/rpc/<ns>:<ação>                   src/api/transport.ts (fetch + SSE)
         → ipcMain.handle('<ns>:<ação>')               server/rpc.ts (shim, não é Electron)
         → funções em server/database/queries.ts       sql.js, só o servidor toca no banco
```

| Caminho | O que é |
|---|---|
| `server/index.ts` | Fastify: `/api/rpc/:canal`, `/api/events` (SSE), export, OAuth Google, estáticos |
| `server/rpc.ts` | **todos** os handlers RPC + agendador (regras, agentes, sync Google, radar de projetos) |
| `server/database/schema.ts` | `CREATE TABLE IF NOT EXISTS` de tudo |
| `server/database/db.ts` | carga/persistência do arquivo, `MIGRATIONS` (`PRAGMA user_version`), snapshots |
| `server/database/queries.ts` | CRUD; helpers `getAll`/`getOne`/`run` |
| `server/services/` | efeitos colaterais: `claude` (CLI), `github`/`gitscan` (`gh`/git), `google`, `pluggy`, `projectHub`, `secrets` |
| `server/flights/` | monitoramento de passagens: geo, planejador, restrições/ranking, executor de jobs, provedores, IA (ver `docs/passagens.md`) |
| `shared/` | tipos/helpers puros compartilhados entre servidor e front (incluído nos dois tsconfigs) |
| `server/events.ts` | `broadcast(canal, payload)` → SSE |
| `server/config.ts` | variáveis `RICKOS_*` (data dir, porta, host, token, URL pública) |
| `electron/main` | janela, atalho global, notificações nativas; sobe o servidor ou reusa um já rodando |
| `electron/preload` | `window.desktop`: só o que o navegador não faz |
| `src/App.tsx` | `NAV_GROUPS` (sidebar) + `PAGES` (registry); rota = `#/<page>` |
| `src/types/index.ts` | interfaces, union `Page`, tipos de `window.api` e `window.desktop` |
| `src/modules/<módulo>/` | `pages/`, `components/`, `store/` de cada área |
| `src/store/` | stores globais (`uiStore`, `notificationStore`) |
| `src/styles/` | `skin-devlytics.css`, `responsive.css`, `skin.ts` (`DEFAULT_SKIN`); a skin clássica é `src/index.css` |

## Receita: nova entidade/feature

1. Tabela nova em `schema.ts`. Alterar tabela existente = nova entrada em `MIGRATIONS` (`db.ts`), com a próxima `version` e `ALTER` dentro de `try/catch`.
2. Funções em `queries.ts`.
3. `ipcMain.handle('<ns>:<ação>', …)` em `server/rpc.ts`.
4. Método em `src/api/createApi.ts` e tipo em `src/types/index.ts` (`Window.api`).
5. Store Zustand do módulo → página/componentes.
6. Página nova: adicione ao union `Page` **e** a `NAV_GROUPS` **e** a `PAGES` (o TS acusa se faltar no `PAGES`).

Molde simples para copiar: `todos` / `habits`.

## Regras

* **Tudo funciona no desktop e na web/celular.** Nada exclusivo de uma plataforma sem alternativa equivalente na outra.
* O front **nunca** usa Electron, `ipcRenderer`, `fs`, `child_process` nem Node. Tudo passa por `window.api`.
* Recurso nativo: `window.desktop?.x ?? <fallback web>` (exemplo: `openExternal` em `createApi.ts`).
* Arquivos: download/upload via `src/api/files.ts`, nunca diálogos nativos.
* Efeitos colaterais (CLI, rede, arquivos) ficam em `server/`, que não importa nada de Electron.
* Servidor → clientes: `broadcast()` no servidor + `subscribe()` de `src/api/transport.ts`. Os canais estão listados em `server/events.ts`.
* sql.js **não aceita parâmetros em `db.exec`**: use `getAll`/`getOne`/`run` (prepare/step).
* Credenciais: chaves em `SENSITIVE_KEYS` (`server/services/secrets.ts`) são criptografadas com AES-GCM ao salvar. Nunca logue nem commite segredos.

## UI

* Tem que funcionar em desktop (≥ 900px) e celular (390px). Ajustes mobile vão em `src/styles/responsive.css`.
* Duas skins (`classic`, `devlytics`) × temas escuro/claro. Use as variáveis CSS (`--bg-*`, `--text-*`, `--accent`, `--border`), nunca cores fixas.

## Git

* Commits convencionais em pt-BR: `feat(projetos): …`, `fix(scripts): …`.
* `dist-electron/` é versionado (o `TimeTracker.app` usa esse build). Atualize com `npm run build` num commit separado: `build: atualiza dist-electron`.
* `docs/screenshots/` contém dados pessoais e fica fora do git.

## Antes de concluir

1. Os dois `tsc --noEmit` passam.
2. Testou no desktop e na web, inclusive em viewport de 390px.

## Outros docs

* `README.md`: visão geral, uso diário, celular/VPS, variáveis de ambiente.
* `docs/ia.md`: catálogo detalhado de features para brainstorm. Pode estar desatualizado; o código manda.
* `docs/passagens.md`: arquitetura, fontes e configuração do monitoramento de passagens.
* `docs/ROADMAP_RICKOS.md`: formato do arquivo de roadmap que a Central de Projetos lê de cada repositório.
