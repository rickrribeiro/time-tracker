import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { dataDir } from '../config'
import { getSetting, setSetting } from '../database/queries'

/**
 * Setting keys encrypted at rest. The server runs without Electron, so instead of
 * the OS keychain (safeStorage) it uses AES-256-GCM with a random key stored in
 * `<dataDir>/secret.key` (chmod 600). Values encrypted by the old Electron build
 * carry the `enc:` prefix and are converted once by `migrateLegacySecrets`.
 */
export const SENSITIVE_KEYS = new Set([
  'github_token',
  'google_client_secret',
  'google_refresh_token',
  'google_accounts',
  'pluggy_client_id',
  'pluggy_client_secret',
  'skyscanner_rapidapi_key',
  'flights_travelpayouts_token',
  'flights_duffel_token'
])
const AES_PREFIX = 'aes:'
const LEGACY_PREFIX = 'enc:'

let cachedKey: Buffer | null = null

function secretKey(): Buffer {
  if (cachedKey) return cachedKey
  const file = path.join(dataDir(), 'secret.key')
  if (fs.existsSync(file)) {
    cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64')
  } else {
    cachedKey = crypto.randomBytes(32)
    fs.writeFileSync(file, cachedKey.toString('base64'), { mode: 0o600 })
  }
  return cachedKey
}

export function encodeSecret(key: string, value: string): string {
  if (!SENSITIVE_KEYS.has(key) || !value) return value
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return AES_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64')
}

/** Decrypt a stored value; plaintext passes through (backward compat). */
export function decodeSecret(value: string | null): string | null {
  if (value == null) return value
  if (value.startsWith(AES_PREFIX)) {
    try {
      const raw = Buffer.from(value.slice(AES_PREFIX.length), 'base64')
      const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    } catch {
      return '' // key changed / corrupt
    }
  }
  if (value.startsWith(LEGACY_PREFIX)) return '' // old keychain value not migrated yet
  return value
}

/**
 * Values still encrypted by the old Electron build (`enc:` + OS keychain), as
 * `{ key: base64 }`. Only the desktop app can decrypt them (safeStorage); it then
 * saves the plaintext back through `settings:set`, which re-encrypts with AES.
 */
export async function legacySecrets(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const key of SENSITIVE_KEYS) {
    const v = await getSetting(key)
    if (v && v.startsWith(LEGACY_PREFIX)) out[key] = v.slice(LEGACY_PREFIX.length)
  }
  return out
}
