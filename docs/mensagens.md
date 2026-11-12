# Central de Mensagens

Página **Social → Chats**. Reúne WhatsApp, Instagram, LinkedIn e outras redes (hoje via
**Beeper Desktop API**) para triagem, lembretes, menções em grupos, vínculo com Pessoas e
sugestões de resposta com IA. O foco é organização pessoal ("não esquecer ninguém"), não
virar mais um cliente de mensagens.

## Como ativar

### Com o script (recomendado, repetível em outro Mac)

```bash
npm run beeper:setup                               # rickOS neste Mac (modo direto)
RICKOS_URL=https://rickos.seudominio.com RICKOS_TOKEN=… \
  npm run beeper:setup -- --mode agent --service   # rickOS na VPS: agente como serviço
npm run beeper:down                                # desfaz (--uninstall remove o app também)
```

`bin/rickos-beeper-setup.mjs` (sem dependências, Node ≥ 20.6) faz, de forma idempotente:

1. instala o Beeper Desktop (`brew install --cask beeper`) e abre o app;
2. espera a Desktop API em `http://127.0.0.1:23373` e o estado `ready` de `/v1/app/setup`.
   O login na conta (e-mail + código) e a verificação do dispositivo são feitos por você na
   janela do Beeper, e o script avisa o que falta;
3. obtém o token pelo **OAuth da própria Desktop API** (registro dinâmico + PKCE, callback em
   `127.0.0.1` numa porta efêmera). Você só aprova o acesso do "rickOS". O token vai para
   `~/.config/rickos/beeper.json` (0600) e é reaproveitado enquanto valer (`--new-token` força
   outro, `--paste` aceita um token criado à mão);
4. configura o rickOS em `RICKOS_URL` (padrão `http://127.0.0.1:4318`):
   * **direct**: grava endpoint e token no servidor, testa e roda a primeira sincronização;
   * **agent**: gera a chave do agente e grava `~/.config/rickos/chat-agent.env` (0600).
     Com `--service`, instala o LaunchAgent `com.rickos.chat-agent`
     (`node --env-file=… bin/rickos-chat-agent.mjs`, log em `~/Library/Logs/rickOS/chat-agent.log`).

`--token-only` para no passo 3. `--no-install` pula a instalação. `--help` lista tudo.

### Manualmente

1. **Beeper Desktop** no Mac: *Settings → Integrations*, ative a Desktop API e crie um token
   em *Approved connections* (+). A API escuta em `http://localhost:23373`, só em loopback.
2. rickOS: **Configurações → Mensagens**: ative, escolha o provedor *Beeper Desktop API*
   e o modo de conexão:
   - **Direta**: o servidor do rickOS alcança o Beeper (mesmo Mac, ou rede privada/Tailscale).
     Informe o endpoint e o token, depois clique em *Testar conexão*.
   - **Agente local**: o rickOS roda num servidor (VPS) e o Beeper no Mac. Clique em *Gerar
     chave do agente* e rode no Mac:
     ```bash
     RICKOS_URL=https://rickos.seudominio.com \
     RICKOS_TOKEN=<RICKOS_TOKEN do servidor> \
     RICKOS_AGENT_KEY=<chave gerada> \
     BEEPER_TOKEN=<token do Beeper> \
     npm run chat-agent          # = node bin/rickos-chat-agent.mjs (Node ≥ 18; ≥ 22 p/ tempo real)
     ```
     Ou, com as variáveis num arquivo: `node --env-file=~/.config/rickos/chat-agent.env bin/rickos-chat-agent.mjs`.
3. Escolha quais contas sincronizar. A primeira carga lê até `Máx. conversas na 1ª carga`
   (padrão 1500); as seguintes são incrementais.

Para conhecer a interface sem o Beeper, use o provedor **Demonstração (dados fictícios)**.
A UI mostra um aviso permanente enquanto ele estiver ativo.

### Docker / Beeper Server

Não há imagem Docker oficial do Beeper. Para subir e derrubar com um comando, use
`npm run beeper:setup` / `npm run beeper:down`. Existe o **Beeper Server** (headless), instalado pelo
CLI oficial (`brew install beeper/tap/cli` → `beeper setup --server --install`). Ele expõe a
mesma API, mas a paridade e o empacotamento não estão documentados. Hoje o caminho suportado é
o Beeper Desktop no Mac (direto ou via agente). Se você testar o Beeper Server, aponte o
endpoint do modo direto (ou o `BEEPER_URL` do agente) para ele: nada no rickOS depende de ser
o Desktop.

## Arquitetura

```
src/modules/chats/        UI (página, filtros, conversa, painel, triagem, radar, IA, widget da Home)
  api.ts                  window.api.chats (canais chats:*)
shared/chats.ts           tipos normalizados (ChatSummary, ChatMessage, filtros, capabilities…)
server/chats/
  providers/types.ts      contrato ChatProvider (+ RemoteChat/RemoteMessage) e capabilities
  providers/beeper.ts     Beeper Desktop API v1 (validado no SDK @beeper/desktop-api 6.0.0)
  providers/mock.ts       demonstração/testes (falhas simuladas, mensagens novas/duplicadas)
  transport.ts            transporte direto (endpoint validado contra SSRF) + rotas permitidas
  agentRelay.ts           relay do agente local (long-poll de saída) + rotas /api/chats/agent/*
  sync.ts                 sincronização incremental, tempo real, backoff, lembretes, notificações
  service.ts              resumo/filtros/contadores/radar, mensagens (cache só em memória), envio
  classify.ts             regras puras: não lido × não respondido, encerramentos, prioridade
  repo.ts                 banco (transação + 1 save), organização, tags, reconciliação
  ai.ts                   AiEngine (Claude Code CLI hoje), sugestões e resumos
  rpc.ts                  canais chats:*
bin/rickos-chat-agent.mjs agente local (sem dependências)
```

### Dados: o que é de quem

| Do rickOS (preservado sempre) | Do provedor (cache descartável) |
|---|---|
| `chat_org`: pessoa vinculada, prioridade, estado manual, adiamento/lembrete, notas, menções revisadas | `chats`: título, rede, contadores, última atividade, prévia curta (opcional), flags de classificação |
| `labels`/`label_links`: tags de conversas **e** de pessoas | `chat_accounts`: contas do provedor |
| `chat_todos`, `chat_templates`, `contacts.priority/vip` | mensagens: **só em memória** (LRU de 40 conversas), nunca no banco |

* O texto das mensagens não é gravado no banco. Fica só uma prévia de até 160 caracteres,
  que dá para desligar em *Guardar prévia*. A classificação usa flags derivadas do texto
  (pergunta? encerramento?), não o texto em si.
* `Limpar cache` e `Desconectar` nunca apagam organização; conversas com organização ficam
  visíveis como *provedor inativo*.
* Identidade: `chats.key = <provedor>:<id remoto>`. A organização fica presa ao `id` local.

### Trocar de provedor (ex.: Beeper → conector direto de WhatsApp)

Ao sincronizar um provedor novo, `repo.reconcile()` move a organização (pessoa, tags,
prioridade, lembretes, TODOs) da conversa antiga para a nova **quando rede + identificador
remoto (telefone E.164, @usuário…) são exatamente iguais**. Nunca por nome. Conversas sem
identificador (grupos) não são reconciliadas automaticamente.

### Classificação (não lido ≠ não respondido)

* **Não lido**: o contador do provedor. `null` significa que o provedor não informa, o que é diferente de zero.
* **Preciso responder**: há mensagem recebida depois da minha última, ignorando encerramentos
  ("ok", "valeu", 👍, "kkkk"). Em grupos, só com menção a mim ou resposta a uma mensagem minha.
* **Aguardando resposta**: minha última mensagem foi uma pergunta.
* **Correção manual** (preciso responder / aguardando / não requer / resolvido) vale até um fato
  novo: chega mensagem (resolvido/não requer/aguardando) ou eu respondo (preciso responder).
* **Adiada**: some do radar até a data. Se chegar mensagem nova e *reabrir* estiver marcado,
  volta destacada como "Reaberta".
* **Menções**: `unreadMentionsCount`/`mentions[]` do provedor. Sem esse dado, o rickOS estima
  pelo texto (seu nome/@) e marca como estimativa (`~@2`).
* **Prioridade**: pontuação explicável (menções, VIP/prioridade da pessoa, prioridade manual,
  tags profissionais, pergunta pendente, recência, tempo esperando, grupo grande, silenciado),
  com pesos em *Configurações → Mensagens*. Só ordena e sugere: nunca altera a prioridade manual.

### IA

* Vão para a IA **somente as mensagens selecionadas** pelo usuário. Na triagem em lote, o modal
  mostra quais mensagens de cada conversa serão enviadas, e dá para desmarcar.
* Notas da pessoa só entram com opt-in explícito por pedido.
* O prompt delimita o conteúdo como dado (JSON) e proíbe seguir instruções vindas das mensagens.
  O Claude roda com `--tools ""`, `--strict-mcp-config`, em diretório temporário.
* Enviar é sempre uma ação explícita, com tela de confirmação nas sugestões. Não há envio em massa.

### Editar e apagar

Nas mensagens **suas**, o menu da mensagem mostra *editar* (inline, `Ctrl/⌘+Enter` salva) e
*apagar* (confirmação com **para todos** ou **só para mim**). O servidor recusa mensagem de outra
pessoa, já apagada, com anexo (não editável) ou texto vazio, e depois reclassifica a conversa.
Apagar sua última resposta faz a conversa voltar a "preciso responder". No Beeper:
`PUT`/`DELETE /v1/chats/{chat}/messages/{msg}`. Limites de tempo e de quantidade de edições
são regras da rede, e o erro dela aparece na tela. Apagar a **conversa** continua fora da
lista de rotas permitidas.
* Para trocar o mecanismo (Claude API, Ollama…), implemente `AiEngine` (`server/chats/ai.ts`)
  e chame `setAiEngine()`.

## Segurança

* Token do Beeper e chave do agente: AES-GCM em repouso (`SENSITIVE_KEYS`) e **nunca** devolvidos
  ao front (`SERVER_ONLY_KEYS`: `settings:get/getAll` omitem).
* Endpoint do modo direto: só loopback, rede privada, Tailscale (`100.64/10`, `*.ts.net`) ou `.local`,
  sem caminho nem credenciais. Isso bloqueia o uso do servidor para SSRF (ex.: `169.254.169.254`).
* Agente: loopback para o Beeper, https para o rickOS fora da rede local, rotas permitidas fixas
  (`ALLOWED_ROUTES`, replicadas no agente), autenticação dupla (token do rickOS + chave do agente).
* Anexos: o front recebe uma URL assinada (HMAC, expira em 6 h) para `/api/chats/asset`, nunca
  a referência `mxc://` crua.
* Logs não registram tokens nem texto de mensagens.

## Limitações conhecidas

* **Histórico**: o Beeper pode não ter mensagens antigas (principalmente logo após conectar uma
  conta). A conversa avisa "início do histórico disponível", o que não significa que não existam mensagens antes.
* **Tempo real**: o WebSocket do Beeper é *experimental*. No desktop (Electron 29 / Node 20) não há
  `WebSocket` nativo, então vale o polling. No modo agente, o tempo real depende do agente estar em Node ≥ 22.
* **Busca no texto**: usa a busca do provedor (até 20 resultados por consulta). A busca da lista
  cobre nome, prévia, pessoa, notas e tags.
* **Reações e envio de anexos** pelo rickOS ainda não existem (leitura, sim). Editar/apagar
  usa a capacidade geral do provedor: numa rede que não permite, o botão aparece e o erro da
  rede é mostrado.
* **Grupos**: não há lista completa de participantes para vincular cada um a uma Pessoa pelo grupo.
  Vincule as conversas individuais.
* Imagens/avatares das conversas (`mxc://`/`file://`) não são exibidos.
* Integrações não oficiais podem levar a bloqueio das contas nas redes. O rickOS não tenta
  contornar restrições e nunca envia nada em massa.

## Adicionar um provedor

1. Crie `server/chats/providers/<nome>.ts` implementando `ChatProvider` (`providers/types.ts`):
   `listAccounts`, `listChats` (mais recente primeiro, com `olderCursor`), `getChat`,
   `listMessages`, `sendMessage` e, se suportado, `markRead/markUnread`, `searchMessages`,
   `fetchAttachment`, `subscribe`. Declare o que funciona em `capabilities()`. Contagens
   desconhecidas são `null`.
2. Preencha `peerHandle` (telefone E.164, @usuário) nas conversas individuais: é a chave da
   reconciliação com o provedor anterior.
3. Registre em `activeProvider()` (`server/chats/service.ts`), em `PROVIDERS_INFO`
   (`shared/chats.ts`) e na validação de `saveConfig` (`server/chats/config.ts`).
4. Credenciais: novas chaves em `SENSITIVE_KEYS` **e** `SERVER_ONLY_KEYS`.
5. Testes: copie os casos de `server/chats/__tests__/chats.test.ts` usando o novo provedor.
