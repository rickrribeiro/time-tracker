import { safeStorage } from 'electron'

/** Setting keys encrypted at rest with the OS keychain via Electron safeStorage. */
export const SENSITIVE_KEYS = new Set(['github_token'])
const ENC_PREFIX = 'enc:'

export function encodeSecret(key: string, value: string): string {
  if (!SENSITIVE_KEYS.has(key) || !value) return value
  if (!safeStorage.isEncryptionAvailable()) return value // fallback: plaintext (e.g. Linux sem keychain)
  return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
}

/** Decrypt a stored value if it carries the enc: marker; plaintext passes through (backward compat). */
export function decodeSecret(value: string | null): string | null {
  if (value == null || !value.startsWith(ENC_PREFIX)) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return '' // decryptable only on the machine that encrypted it
  }
}
