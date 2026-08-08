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

/**
 * Run the local Claude Code CLI headlessly: `claude -p "<prompt>"`.
 * Prompt is passed as an argv element (no shell) to avoid injection.
 * Resolves with stdout text; rejects with a friendly message on failure.
 */
export function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!prompt.trim()) {
      reject(new Error('Prompt vazio.'))
      return
    }

    const child = spawn('claude', ['-p', prompt], {
      env: { ...process.env, PATH: buildPath() }
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error('Tempo esgotado (120s) executando o Claude CLI.'))
    }, TIMEOUT_MS)

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            'Claude CLI não encontrado. Instale o Claude Code e garanta que `claude` está no PATH.'
          )
        )
      } else {
        reject(err)
      }
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `Claude CLI saiu com código ${code}.`))
      }
    })
  })
}
