type PersistedEnvelope = {
  wrappedToken: string
  wrappedTokenIv: string
  wrappedTokenSalt: string
  vault: string
  vaultIv: string
  vaultSalt: string
}

type SessionPayload = {
  token: string
  csrfToken: string
  adminEmail: string
  expiresAt: string
}

const SESSION_KEY = 'lambase_dashboard_session_v2'
const DEVICE_KEY = 'lambase_dashboard_device_key_v1'

function toB64(input: Uint8Array) {
  return btoa(String.fromCharCode(...input))
}

function fromB64(input: string) {
  return Uint8Array.from(atob(input), (c) => c.charCodeAt(0))
}

function randomBytes(size: number) {
  const out = new Uint8Array(size)
  crypto.getRandomValues(out)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 120000,
      salt: salt as unknown as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptText(plain: string, passphrase: string) {
  const iv = randomBytes(12)
  const salt = randomBytes(16)
  const key = await deriveKey(passphrase, salt)
  const data = new TextEncoder().encode(plain)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource,
  )
  return {
    cipher: toB64(new Uint8Array(cipher)),
    iv: toB64(iv),
    salt: toB64(salt),
  }
}

async function decryptText(cipherB64: string, ivB64: string, saltB64: string, passphrase: string) {
  const key = await deriveKey(passphrase, fromB64(saltB64))
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as unknown as BufferSource },
    key,
    fromB64(cipherB64) as unknown as BufferSource,
  )
  return new TextDecoder().decode(plainBuffer)
}

function getOrCreateDeviceSecret() {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const created = toB64(randomBytes(32))
  localStorage.setItem(DEVICE_KEY, created)
  return created
}

export async function saveSessionEncrypted(payload: SessionPayload) {
  const deviceSecret = getOrCreateDeviceSecret()

  const wrappedToken = await encryptText(payload.token, deviceSecret)
  const sessionVault = await encryptText(
    JSON.stringify(payload),
    `${deviceSecret}:${payload.token}`,
  )

  const envelope: PersistedEnvelope = {
    wrappedToken: wrappedToken.cipher,
    wrappedTokenIv: wrappedToken.iv,
    wrappedTokenSalt: wrappedToken.salt,
    vault: sessionVault.cipher,
    vaultIv: sessionVault.iv,
    vaultSalt: sessionVault.salt,
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(envelope))
}

export async function loadSessionEncrypted(): Promise<SessionPayload | null> {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const envelope = JSON.parse(raw) as PersistedEnvelope
    const deviceSecret = getOrCreateDeviceSecret()
    const token = await decryptText(
      envelope.wrappedToken,
      envelope.wrappedTokenIv,
      envelope.wrappedTokenSalt,
      deviceSecret,
    )

    const vaultRaw = await decryptText(
      envelope.vault,
      envelope.vaultIv,
      envelope.vaultSalt,
      `${deviceSecret}:${token}`,
    )

    return JSON.parse(vaultRaw) as SessionPayload
  } catch {
    clearSessionEncrypted()
    return null
  }
}

export function clearSessionEncrypted() {
  localStorage.removeItem(SESSION_KEY)
}
