import os from 'os'
import path from 'path'
import fs from 'fs'

/**
 * Runtime configuration shared by the whole server. Defaults point at the same
 * folder Electron used as `userData`, so the existing database keeps working.
 *
 * Env vars:
 *  RICKOS_DATA_DIR    where timetracker.db, snapshots/ and secret.key live
 *  RICKOS_PORT        HTTP port (default 4318)
 *  RICKOS_HOST        bind address (default 127.0.0.1; use 0.0.0.0 for the phone)
 *  RICKOS_TOKEN       Bearer token; mandatory when RICKOS_HOST is not local
 *  RICKOS_PUBLIC_URL  public base URL (e.g. https://rickos.example.com) — used for OAuth callbacks
 *  RICKOS_STATIC_DIR  folder with the built web front (default ./dist), served at /
 */
function defaultDataDir(): string {
  const home = os.homedir()
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'time-tracker')
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'time-tracker')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'time-tracker')
}

export interface ServerConfig {
  dataDir: string
  port: number
  host: string
  token: string
  publicUrl: string
  staticDir: string | null
}

const config: ServerConfig = {
  dataDir: process.env.RICKOS_DATA_DIR || defaultDataDir(),
  port: Number(process.env.RICKOS_PORT || 4318),
  host: process.env.RICKOS_HOST || '127.0.0.1',
  token: process.env.RICKOS_TOKEN || '',
  publicUrl: (process.env.RICKOS_PUBLIC_URL || '').replace(/\/+$/, ''),
  staticDir: process.env.RICKOS_STATIC_DIR || null
}

export function getConfig(): ServerConfig {
  return config
}

export function setConfig(patch: Partial<ServerConfig>): void {
  Object.assign(config, patch)
}

export function dataDir(): string {
  fs.mkdirSync(config.dataDir, { recursive: true })
  return config.dataDir
}

export function isLocalHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}
