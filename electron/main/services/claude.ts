import { spawn } from 'child_process'
import os from 'os'
import path from 'path'

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
    let child
    if (viaShell) {
      const shell = process.env.SHELL || '/bin/zsh'
      const modelPart = model ? ' --model "$RICKOS_MODEL"' : ''
      const extraPart = extra.length ? ' ' + extra.map(shquote).join(' ') : ''
      child = spawn(shell, ['-ilc', `${bin}${extraPart}${modelPart} -p "$RICKOS_PROMPT"`], {
        env: { ...env, RICKOS_PROMPT: prompt, RICKOS_MODEL: model || '' }
      })
    } else {
      const args = [...extra, ...(model ? ['--model', model] : []), '-p', prompt]
      child = spawn(bin, args, { env })
    }

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('Tempo esgotado (120s) executando o Claude CLI.'))
    }, TIMEOUT_MS)

    child.stdout.on('data', (d) => {
      const text = d.toString()
      stdout += text
      opts.onChunk?.(text)
    })
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('error', (err: SpawnErr) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err) // preserve .code so the caller can decide to fall back
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `Claude CLI saiu com código ${code}.`))
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
