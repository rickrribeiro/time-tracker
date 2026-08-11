import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'

const TIMEOUT_MS = 120_000

/** Common locations the `claude` binary may live in, beyond the GUI process PATH. */
function buildPath(): string {
  const home = os.homedir()
  const extra = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.local', 'bin')
  ]
  return [process.env.PATH || '', ...extra].join(path.delimiter)
}

interface SpawnErr extends Error {
  code?: string
}

export interface RunOptions {
  onChunk?: (text: string) => void
  model?: string
  /** Extra CLI flags before `-p` (controlled by the app, e.g. ['--allowedTools', 'Bash(gh:*)']). */
  extraArgs?: string[]
  /** Receives a kill fn once the child spawns, so the run can be cancelled. */
  registerChild?: (kill: () => void) => void
  /** Max run time in ms; 0 disables the timeout (long tasks). Default 120s. */
  timeoutMs?: number
  /** Use `--output-format stream-json` to stream tokens, thinking and tool use live. */
  streamJson?: boolean
  /** Working directory to run the CLI in (e.g. a project's local path). */
  cwd?: string
}

/** Single-quote a token for safe inclusion in the interactive-shell command string. */
function shquote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * Run one attempt. When `viaShell` is false, spawn the binary directly (clean, fast).
 * When true, run through an interactive login shell so shell aliases resolve
 * (e.g. `claude-trabalho='CLAUDE_CONFIG_DIR=~/.claude-trabalho claude'`). The prompt
 * is passed through the RICKOS_PROMPT env var (never interpolated into the command
 * string) so it can't break out — no shell injection. `opts.onChunk` receives stdout
 * incrementally for streaming.
 */
function attempt(bin: string, prompt: string, viaShell: boolean, opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: buildPath() }
    const model = opts.model?.trim()
    const extra = opts.extraArgs ?? []
    const streamJson = !!opts.streamJson
    const jsonArgs = streamJson ? ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'] : []
    const jsonShell = streamJson ? ' --output-format stream-json --verbose --include-partial-messages' : ''
    // stdin must be closed ('ignore') — otherwise `claude -p` waits for stdin data
    // (it warns "no stdin data received in 3s") and can hang on an open pipe.
    const stdio: ['ignore', 'pipe', 'pipe'] = ['ignore', 'pipe', 'pipe']
    // run inside the project's directory when provided (and it exists)
    const cwd = opts.cwd && fs.existsSync(opts.cwd) ? opts.cwd : undefined
    let child
    if (viaShell) {
      const shell = process.env.SHELL || '/bin/zsh'
      const modelPart = model ? ' --model "$RICKOS_MODEL"' : ''
      const extraPart = extra.length ? ' ' + extra.map(shquote).join(' ') : ''
      child = spawn(shell, ['-ilc', `${bin}${extraPart}${modelPart}${jsonShell} -p "$RICKOS_PROMPT"`], {
        env: { ...env, RICKOS_PROMPT: prompt, RICKOS_MODEL: model || '' },
        stdio,
        cwd
      })
    } else {
      const args = [...extra, ...(model ? ['--model', model] : []), ...jsonArgs, '-p', prompt]
      child = spawn(bin, args, { env, stdio, cwd })
    }

    // expose a kill handle so callers (IPC) can cancel this run
    opts.registerChild?.(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let lineBuf = ''
    let assistantText = ''
    let finalText: string | null = null

    // stream-json: parse each JSON line into live text / thinking / tool-use progress
    const processLine = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed) return
      let evt: {
        type?: string
        result?: unknown
        event?: { type?: string; delta?: { type?: string; text?: string; thinking?: string }; content_block?: { type?: string; name?: string } }
      }
      try {
        evt = JSON.parse(trimmed)
      } catch {
        return
      }
      if (evt.type === 'stream_event' && evt.event) {
        const ev = evt.event
        if (ev.type === 'content_block_start' && ev.content_block) {
          if (ev.content_block.type === 'thinking') opts.onChunk?.('\n💭 ')
          else if (ev.content_block.type === 'tool_use') opts.onChunk?.(`\n🔧 ${ev.content_block.name || 'tool'} `)
        } else if (ev.type === 'content_block_delta' && ev.delta) {
          if (ev.delta.type === 'text_delta' && ev.delta.text) {
            assistantText += ev.delta.text
            opts.onChunk?.(ev.delta.text)
          } else if (ev.delta.type === 'thinking_delta' && ev.delta.thinking) {
            opts.onChunk?.(ev.delta.thinking)
          }
        }
      } else if (evt.type === 'result' && typeof evt.result === 'string') {
        finalText = evt.result
      }
    }

    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return
            settled = true
            child.kill('SIGKILL')
            reject(new Error(`Tempo esgotado (${Math.round(timeoutMs / 1000)}s) executando o Claude CLI.`))
          }, timeoutMs)
        : null
    const clear = (): void => {
      if (timer) clearTimeout(timer)
    }

    child.stdout.on('data', (d) => {
      const text = d.toString()
      stdout += text
      if (streamJson) {
        lineBuf += text
        let idx: number
        while ((idx = lineBuf.indexOf('\n')) >= 0) {
          processLine(lineBuf.slice(0, idx))
          lineBuf = lineBuf.slice(idx + 1)
        }
      } else {
        opts.onChunk?.(text)
      }
    })
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('error', (err: SpawnErr) => {
      if (settled) return
      settled = true
      clear()
      reject(err) // preserve .code so the caller can decide to fall back
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clear()
      if (streamJson && lineBuf.trim()) processLine(lineBuf)
      if (code === 0) {
        resolve(streamJson ? finalText ?? (assistantText.trim() || stdout.trim()) : stdout.trim())
      } else {
        reject(new Error(stderr.trim() || (streamJson ? finalText ?? '' : '') || `Claude CLI saiu com código ${code}.`))
      }
    })
  })
}

/**
 * Run the local Claude Code CLI headlessly: `<command> -p "<prompt>"`.
 * `command` is the configured CLI (default "claude"); supports multiple subscriptions
 * (e.g. "claude" vs "claude-trabalho"). Tries a direct binary spawn first; if the
 * command isn't a binary on PATH (ENOENT — typical for a shell alias), retries through
 * an interactive login shell so aliases resolve.
 */
export async function runClaude(prompt: string, command = 'claude', opts: RunOptions = {}): Promise<string> {
  const bin = (command || '').trim() || 'claude'
  if (!/^[A-Za-z0-9_./-]+$/.test(bin)) {
    throw new Error(`Comando inválido: "${bin}". Use apenas letras, números, ., _, - ou /.`)
  }
  if (!prompt.trim()) throw new Error('Prompt vazio.')

  try {
    return await attempt(bin, prompt, false, opts)
  } catch (err) {
    if ((err as SpawnErr)?.code === 'ENOENT') {
      // Not a binary on PATH — likely a shell alias; retry via interactive shell.
      try {
        return await attempt(bin, prompt, true, opts)
      } catch (err2) {
        if ((err2 as SpawnErr)?.code === 'ENOENT') {
          throw new Error(
            `Comando "${bin}" não encontrado. Verifique o comando do Claude em Configurações e se ele existe (binário ou alias no seu shell).`
          )
        }
        throw err2
      }
    }
    throw err
  }
}
