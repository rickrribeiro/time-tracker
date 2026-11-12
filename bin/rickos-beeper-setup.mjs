#!/usr/bin/env node
/**
 * Prepara o Beeper Desktop para a Central de Mensagens do rickOS, de ponta a ponta e de
 * forma repetível em outro computador:
 *
 *   1. instala o Beeper Desktop (macOS: Homebrew `--cask beeper`);
 *   2. abre o app e espera a Desktop API (http://127.0.0.1:23373) responder;
 *   3. espera você entrar na conta e terminar a verificação (estado `ready`);
 *   4. obtém um token pela própria API (OAuth + PKCE em loopback: você só clica em
 *      "Aprovar" na janela do Beeper). Fallback: `--paste` para colar um token manual;
 *   5. configura o rickOS:
 *        direct → grava endpoint + token no servidor do rickOS (mesmo Mac);
 *        agent  → gera a chave do agente e grava ~/.config/rickos/chat-agent.env;
 *                 com `--service`, instala um LaunchAgent que mantém o agente rodando.
 *
 *   `--down` desfaz: remove o LaunchAgent, revoga o token no Beeper, apaga os arquivos
 *   locais e desativa a Central no rickOS (a organização — pessoas, tags, notas — fica).
 *
 * Uso:
 *   npm run beeper:setup                        # modo direto, rickOS em http://127.0.0.1:4318
 *   npm run beeper:setup -- --mode agent --service   # rickOS remoto (RICKOS_URL=https://…)
 *   npm run beeper:setup -- --token-only        # só obtém/valida o token
 *   npm run beeper:down
 *
 * Variáveis: RICKOS_URL (padrão http://127.0.0.1:4318), RICKOS_TOKEN (se o servidor exigir),
 * BEEPER_URL (padrão http://127.0.0.1:23373, precisa ser loopback).
 *
 * Segurança: o token do Beeper é gravado só em arquivos 0600 em ~/.config/rickos e enviado
 * apenas ao rickOS configurado; nunca é impresso. Sem dependências (Node ≥ 20.6).
 */

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d
}
const env = (k, d = '') => (process.env[k] ?? d).trim()

const RICKOS_URL = env('RICKOS_URL', 'http://127.0.0.1:4318').replace(/\/+$/, '')
const RICKOS_TOKEN = env('RICKOS_TOKEN')
const BEEPER_URL = env('BEEPER_URL', 'http://127.0.0.1:23373').replace(/\/+$/, '')
const CONF_DIR = path.join(os.homedir(), '.config', 'rickos')
const TOKEN_FILE = path.join(CONF_DIR, 'beeper.json')
const AGENT_ENV = path.join(CONF_DIR, 'chat-agent.env')
const LABEL = 'com.rickos.chat-agent'
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'rickOS')
const MAC = process.platform === 'darwin'

const isLocal = (u) => {
  const h = new URL(u).hostname.replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127\./.test(h)
}
const isPrivate = (u) => {
  const h = new URL(u).hostname.replace(/^\[|\]$/g, '')
  return isLocal(u) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || h.endsWith('.ts.net') || h.endsWith('.local')
}

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const c = { b: paint(1), g: paint(32), y: paint(33), r: paint(31), d: paint(2) }
const step = (s) => console.log(`\n${c.b('▸')} ${c.b(s)}`)
const ok = (s) => console.log(`  ${c.g('✓')} ${s}`)
const info = (s) => console.log(`  ${c.d(s)}`)
const warn = (s) => console.log(`  ${c.y('!')} ${s}`)
function die(s) {
  console.error(`\n${c.r('✗')} ${s}`)
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function writeSecret(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, content, { mode: 0o600 })
  fs.chmodSync(file, 0o600)
}

function openUrl(u) {
  const cmd = MAC ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  spawnSync(cmd, [u], { stdio: 'ignore' })
}

// ── Beeper: instalação e prontidão ────────────────────────────────────────────

function beeperApp() {
  return ['/Applications/Beeper Desktop.app', path.join(os.homedir(), 'Applications', 'Beeper Desktop.app')].find((p) => fs.existsSync(p)) ?? null
}

function installBeeper() {
  step('Beeper Desktop')
  if (!MAC) {
    if (beeperApp()) return ok('instalado')
    warn('Instalação automática só no macOS. Baixe em https://www.beeper.com/download, abra o app e rode este script de novo com --no-install.')
    return
  }
  if (beeperApp()) return ok(`instalado (${beeperApp()})`)
  const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => fs.existsSync(p))
  if (!brew) die('Homebrew não encontrado. Instale em https://brew.sh ou baixe o Beeper em https://www.beeper.com/download.')
  info('brew install --cask beeper')
  const r = spawnSync(brew, ['install', '--cask', 'beeper'], { stdio: 'inherit' })
  if (r.status !== 0 || !beeperApp()) die('Falha ao instalar o Beeper pelo Homebrew.')
  ok('instalado')
}

async function beeperInfo() {
  try {
    const r = await fetch(`${BEEPER_URL}/v1/info`, { signal: AbortSignal.timeout(2000) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

async function ensureBeeperRunning() {
  step('Desktop API')
  let i = await beeperInfo()
  if (!i && MAC && beeperApp()) {
    info('abrindo o Beeper Desktop…')
    spawnSync('open', ['-a', beeperApp()], { stdio: 'ignore' })
  }
  for (let n = 0; !i && n < 90; n++) {
    await sleep(1000)
    i = await beeperInfo()
  }
  if (!i) die(`A Desktop API não respondeu em ${BEEPER_URL}. No Beeper: Settings → Integrations → ative "Beeper Desktop API" e rode de novo.`)
  if (i.server?.remote_access) warn('O Beeper está com "remote access" ligado. O rickOS não precisa disso; prefira deixar desligado.')
  ok(`Beeper ${i.app?.version ?? ''} respondendo em ${BEEPER_URL}`)
  return i
}

const SETUP_MSG = {
  'needs-login': 'Entre na sua conta na janela do Beeper (e-mail + código).',
  initializing: 'Beeper inicializando…',
  'needs-cross-signing-setup': 'Conclua a configuração de criptografia na janela do Beeper.',
  'needs-verification': 'Verifique este dispositivo na janela do Beeper (outro dispositivo ou chave de recuperação).',
  'needs-secrets': 'Informe a chave de recuperação na janela do Beeper.',
  'needs-first-sync': 'Primeira sincronização do Beeper em andamento (pode levar alguns minutos)…'
}

async function waitBeeperReady() {
  step('Conta do Beeper')
  let last = ''
  const deadline = Date.now() + 45 * 60_000
  while (Date.now() < deadline) {
    let state = 'unknown'
    try {
      const r = await fetch(`${BEEPER_URL}/v1/app/setup`, { signal: AbortSignal.timeout(3000) })
      if (r.ok) state = (await r.json()).state ?? 'unknown'
      else if (r.status === 404) return ok('pronta (versão sem /v1/app/setup)')
    } catch {
      state = 'offline'
    }
    if (state === 'ready') return ok('conectada e sincronizada')
    if (state !== last) {
      last = state
      warn(SETUP_MSG[state] ?? `estado do Beeper: ${state}`)
      if (state === 'needs-login' && MAC && beeperApp()) spawnSync('open', ['-a', beeperApp()], { stdio: 'ignore' })
      info('aguardando… (Ctrl+C para sair; rode de novo quando terminar)')
    }
    await sleep(3000)
  }
  die('Tempo esgotado esperando o Beeper ficar pronto.')
}

// ── Token: OAuth (PKCE) na própria Desktop API ────────────────────────────────

function readSaved() {
  try {
    const j = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
    return j?.token ? j : null
  } catch {
    return null
  }
}

async function tokenWorks(token) {
  try {
    const r = await fetch(`${BEEPER_URL}/v1/accounts`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) })
    if (r.status === 401 || r.status === 403) return null
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const j = await r.json()
    return Array.isArray(j) ? j : j.items ?? []
  } catch (e) {
    die(`Falha ao consultar as contas do Beeper: ${e.message}`)
  }
}

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => {
      if (s.includes(q)) process.stdout.write(s)
    }
    rl.question(q, (a) => {
      rl.close()
      process.stdout.write('\n')
      resolve(a.trim())
    })
  })
}

async function oauthToken(meta) {
  const ep = meta?.endpoints?.oauth
  if (!ep?.authorization_endpoint || !ep?.token_endpoint || !ep?.registration_endpoint) throw new Error('Esta versão do Beeper não anuncia OAuth; use --paste.')
  for (const k of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
    if (!isLocal(ep[k])) throw new Error(`Endpoint OAuth fora do loopback (${k}); abortando.`)
  }
  const verifier = crypto.randomBytes(48).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('base64url')

  // servidor de callback efêmero, só em 127.0.0.1
  let resolveCode
  const got = new Promise((r) => (resolveCode = r))
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (u.pathname !== '/callback') return void res.writeHead(404).end()
    const done = (title, body) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>rickOS</title><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h2>${title}</h2><p>${body}</p></body>`)
    }
    if (u.searchParams.get('state') !== state) return done('Pedido inválido', 'O parâmetro state não confere. Volte ao terminal.')
    if (u.searchParams.get('error')) {
      done('Acesso negado', 'Nada foi autorizado. Pode fechar esta aba.')
      return resolveCode({ error: u.searchParams.get('error_description') || u.searchParams.get('error') })
    }
    done('rickOS autorizado ✓', 'Pode fechar esta aba e voltar ao terminal.')
    resolveCode({ code: u.searchParams.get('code') })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const redirect = `http://127.0.0.1:${srv.address().port}/callback`
  try {
    const reg = await fetch(ep.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: `rickOS (${os.hostname().split('.')[0]})`, redirect_uris: [redirect], scope: 'read write', token_endpoint_auth_method: 'none' })
    })
    if (!reg.ok) throw new Error(`registro do cliente OAuth falhou (HTTP ${reg.status})`)
    const { client_id: clientId } = await reg.json()
    const auth = new URL(ep.authorization_endpoint)
    for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'read write', state, code_challenge: challenge, code_challenge_method: 'S256' })) auth.searchParams.set(k, v)
    warn('Abrindo a autorização no navegador: aprove o acesso do "rickOS" (o Beeper pode pedir confirmação na janela dele).')
    info(`se não abrir, acesse: ${auth.toString()}`)
    openUrl(auth.toString())
    const r = await Promise.race([got, sleep(10 * 60_000).then(() => ({ error: 'tempo esgotado (10 min)' }))])
    if (r.error) throw new Error(`autorização não concluída: ${r.error}`)
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: r.code, code_verifier: verifier, client_id: clientId, redirect_uri: redirect })
    const tr = await fetch(ep.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form })
    const tj = await tr.json().catch(() => ({}))
    if (!tr.ok || !tj.access_token) throw new Error(`troca do código falhou (HTTP ${tr.status}${tj.error ? `: ${tj.error}` : ''})`)
    return { token: tj.access_token, clientId, scope: tj.scope ?? 'read write', expiresIn: tj.expires_in ?? null }
  } finally {
    srv.close()
  }
}

async function obtainToken(meta) {
  step('Token da Desktop API')
  const saved = readSaved()
  if (saved && !flag('new-token')) {
    const accs = await tokenWorks(saved.token)
    if (accs) {
      ok(`token salvo continua válido (${TOKEN_FILE})`)
      return { ...saved, accounts: accs }
    }
    warn('token salvo não vale mais; gerando outro')
  }
  let t
  if (flag('paste')) {
    info('Beeper → Settings → Integrations → Approved connections → + (copie o token)')
    t = { token: await askHidden('  Cole o token (não aparece na tela): '), clientId: null }
  } else {
    try {
      t = await oauthToken(meta)
    } catch (e) {
      warn(e.message)
      info('Alternativa: Beeper → Settings → Integrations → Approved connections → + ; depois rode com --paste')
      die('Não foi possível obter o token automaticamente.')
    }
  }
  const accs = await tokenWorks(t.token)
  if (!accs) die('O Beeper recusou o token.')
  const rec = { token: t.token, clientId: t.clientId ?? null, beeperUrl: BEEPER_URL, createdAt: new Date().toISOString(), expiresIn: t.expiresIn ?? null }
  writeSecret(TOKEN_FILE, JSON.stringify(rec, null, 2))
  ok(`token obtido e salvo em ${TOKEN_FILE} (0600)`)
  return { ...rec, accounts: accs }
}

// ── rickOS ────────────────────────────────────────────────────────────────────

async function rpc(channel, ...a) {
  const r = await fetch(`${RICKOS_URL}/api/rpc/${channel}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(RICKOS_TOKEN ? { Authorization: `Bearer ${RICKOS_TOKEN}` } : {}) },
    body: JSON.stringify({ args: a }),
    signal: AbortSignal.timeout(120_000)
  })
  if (r.status === 401) die('O rickOS recusou o acesso: defina RICKOS_TOKEN (o mesmo do servidor).')
  const j = await r.json().catch(() => ({}))
  if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j.result
}

async function ensureRickos() {
  step(`rickOS (${RICKOS_URL})`)
  if (new URL(RICKOS_URL).protocol !== 'https:' && !isPrivate(RICKOS_URL)) die('Use https:// para um rickOS fora da rede local (o token trafega nessa conexão).')
  try {
    const h = await (await fetch(`${RICKOS_URL}/api/health`, { signal: AbortSignal.timeout(4000) })).json()
    if (!h.ok) throw new Error('health')
  } catch {
    die(`rickOS não respondeu em ${RICKOS_URL}. Suba com bin/rickos-web (ou npm start) ou ajuste RICKOS_URL.`)
  }
  try {
    await rpc('chats:status')
  } catch (e) {
    if (/canal|channel|handler|desconhecid|unknown|not found/i.test(e.message)) die('Este servidor do rickOS ainda não tem a Central de Mensagens. Reinicie-o com o código atual (bin/rickos-stop && bin/rickos-web).')
    throw e
  }
  ok('servidor com a Central de Mensagens')
}

async function configureDirect(tok) {
  step('Configurando o rickOS (modo direto)')
  if (!isPrivate(BEEPER_URL)) die('No modo direto o endpoint do Beeper precisa ser local/privado.')
  await rpc('chats:saveConfig', { enabled: true, providerId: 'beeper', beeperMode: 'direct', beeperUrl: BEEPER_URL, beeperToken: tok.token })
  const t = await rpc('chats:test')
  if (!t.ok) die(`Teste no rickOS falhou: ${t.message}`)
  ok(t.message)
}

async function configureAgent(tok) {
  step('Configurando o rickOS (modo agente)')
  if (!isLocal(BEEPER_URL)) die('O agente precisa falar com o Beeper em loopback (BEEPER_URL=http://127.0.0.1:23373).')
  await rpc('chats:saveConfig', { enabled: true, providerId: 'beeper', beeperMode: 'agent' })
  const { key } = await rpc('chats:agentKey')
  const lines = [
    '# Gerado por bin/rickos-beeper-setup.mjs — contém segredos (0600).',
    `RICKOS_URL=${RICKOS_URL}`,
    RICKOS_TOKEN ? `RICKOS_TOKEN=${RICKOS_TOKEN}` : '# RICKOS_TOKEN=',
    `RICKOS_AGENT_KEY=${key}`,
    `BEEPER_TOKEN=${tok.token}`,
    `BEEPER_URL=${BEEPER_URL}`,
    ''
  ]
  writeSecret(AGENT_ENV, lines.join('\n'))
  ok(`chave do agente gerada; variáveis em ${AGENT_ENV} (0600)`)
  if (flag('service')) installService()
  else info(`rode o agente: node --env-file=${AGENT_ENV} bin/rickos-chat-agent.mjs   (ou repita com --service para deixá-lo sempre ligado)`)
}

function xml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function installService() {
  if (!MAC) return warn('--service só no macOS (launchd). No Linux, crie um serviço systemd --user com o mesmo comando.')
  const node = process.execPath
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(node)}</string><string>--env-file=${xml(AGENT_ENV)}</string><string>${xml(path.join(ROOT, 'bin', 'rickos-chat-agent.mjs'))}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(path.join(LOG_DIR, 'chat-agent.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(LOG_DIR, 'chat-agent.log'))}</string>
</dict></plist>
`
  fs.mkdirSync(path.dirname(PLIST), { recursive: true })
  fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.writeFileSync(PLIST, plist, { mode: 0o644 })
  const uid = process.getuid()
  spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' })
  const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, PLIST], { encoding: 'utf8' })
  if (r.status !== 0) die(`launchctl falhou: ${r.stderr?.trim()}`)
  ok(`agente instalado como serviço (${LABEL}); log em ${path.join(LOG_DIR, 'chat-agent.log')}`)
}

function removeService() {
  if (!MAC || !fs.existsSync(PLIST)) return false
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' })
  fs.rmSync(PLIST, { force: true })
  return true
}

async function waitFirstSync(mode) {
  step('Primeira sincronização')
  if (mode === 'agent') {
    for (let n = 0; n < 30 && !(await rpc('chats:agentStatus')).online; n++) await sleep(1000)
    if (!(await rpc('chats:agentStatus')).online) return warn(`o agente não conectou em 30 s; veja ${path.join(LOG_DIR, 'chat-agent.log')}`)
    ok('agente conectado')
  }
  try {
    await rpc('chats:syncNow', true)
  } catch (e) {
    warn(`sincronização: ${e.message}`)
  }
  const st = await rpc('chats:status')
  const counts = await rpc('chats:counts').catch(() => null)
  ok(`estado: ${st.state}${st.message ? ` — ${st.message}` : ''}`)
  if (counts) info(`${counts.unreadChats ?? '?'} conversas não lidas · ${counts.needsReply ?? '?'} possivelmente pendentes`)
  info(`abra ${RICKOS_URL}/#/chats  (contas a sincronizar: Configurações → Mensagens)`)
}

// ── down ──────────────────────────────────────────────────────────────────────

async function down() {
  step('Desfazendo a integração com o Beeper')
  if (removeService()) ok('LaunchAgent do agente removido')
  const saved = readSaved()
  if (saved?.token) {
    try {
      const meta = await beeperInfo()
      const rev = meta?.endpoints?.oauth?.revocation_endpoint
      if (rev && isLocal(rev)) {
        await fetch(rev, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: saved.token, ...(saved.clientId ? { client_id: saved.clientId } : {}) }) })
        ok('token revogado no Beeper')
      } else warn('Beeper fechado: revogue o token em Settings → Integrations se quiser')
    } catch {
      warn('não foi possível revogar o token agora (Beeper fechado?)')
    }
  }
  for (const f of [TOKEN_FILE, AGENT_ENV]) if (fs.existsSync(f)) (fs.rmSync(f), ok(`apagado ${f}`))
  try {
    await rpc('chats:disconnect')
    ok('Central de Mensagens desconectada no rickOS (pessoas, tags e notas preservadas)')
  } catch (e) {
    warn(`rickOS: ${e.message}`)
  }
  if (flag('uninstall') && MAC) {
    spawnSync('osascript', ['-e', 'quit app "Beeper Desktop"'], { stdio: 'ignore' })
    const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => fs.existsSync(p))
    if (brew) spawnSync(brew, ['uninstall', '--cask', 'beeper'], { stdio: 'inherit' })
  } else info('o app Beeper continua instalado (use --down --uninstall para removê-lo)')
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (flag('help') || flag('h')) {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).replace(/^ \* ?/gm, ''))
    return
  }
  if (flag('down')) return down()
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 20 || (major === 20 && minor < 6)) die('Use Node ≥ 20.6.')
  if (!isLocal(BEEPER_URL)) die('BEEPER_URL precisa ser loopback: este script roda na mesma máquina do Beeper.')
  const mode = opt('mode', isPrivate(RICKOS_URL) ? 'direct' : 'agent')
  if (!['direct', 'agent'].includes(mode)) die('--mode deve ser direct ou agent.')

  console.log(c.b('rickOS · Beeper Desktop'))
  if (!flag('no-install')) installBeeper()
  const meta = await ensureBeeperRunning()
  await waitBeeperReady()
  const tok = await obtainToken(meta)
  const nets = [...new Set(tok.accounts.map((a) => a.network || a.bridge?.type || a.accountID))]
  ok(`${tok.accounts.length} conta(s) no Beeper: ${nets.join(', ') || '—'}`)
  if (flag('token-only')) return
  await ensureRickos()
  if (mode === 'direct') await configureDirect(tok)
  else await configureAgent(tok)
  if (mode === 'direct' || flag('service')) await waitFirstSync(mode)
  console.log(`\n${c.g('Pronto.')}`)
}

main().catch((e) => die(e?.message ?? String(e)))

