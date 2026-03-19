// ─────────────────────────────────────────────────────────
// src/utils/crypto.ts
// Cifratura AES-256-GCM per campi sensibili (PII sanitario)
// IV casuale per ogni cifratura → autenticato con GCM tag
// ─────────────────────────────────────────────────────────

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto'
import { env } from '../config/env.js'

const ALGORITHM   = 'aes-256-gcm'
const IV_LENGTH   = 12   // 96 bit — raccomandato per GCM
const TAG_LENGTH  = 16   // 128 bit auth tag

// Converte la chiave hex (64 char) in Buffer 32 byte
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex')
}

/**
 * Cifra un campo stringa.
 * Output formato: <iv_hex>:<ciphertext_hex>:<authtag_hex>
 */
export function encryptField(plaintext: string): string {
  const key        = getKey()
  const iv         = randomBytes(IV_LENGTH)
  const cipher     = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted  = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  return [
    iv.toString('hex'),
    encrypted.toString('hex'),
    authTag.toString('hex'),
  ].join(':')
}

/**
 * Decifra un campo cifrato con encryptField.
 * Lancia eccezione se il tag GCM non è valido (tampered data).
 */
export function decryptField(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(':')

  if (!ivHex || !encHex || !tagHex) {
    throw new Error('INVALID_CIPHERTEXT_FORMAT')
  }

  const key       = getKey()
  const iv        = Buffer.from(ivHex,  'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const authTag   = Buffer.from(tagHex, 'hex')

  const decipher  = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    throw new Error('DECRYPTION_FAILED')
  }
}

/**
 * Cifra un campo solo se non è già cifrato
 * (utile per upsert dove il valore potrebbe essere già cifrato)
 */
export function encryptIfPlain(value: string): string {
  // Riconosce il formato cifrato: 3 parti hex separate da ':'
  const parts = value.split(':')
  if (parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p))) {
    return value // già cifrato
  }
  return encryptField(value)
}

/**
 * Hash deterministico per ricerca su campi cifrati
 * (es. codice fiscale — deve essere cercabile senza decifrare)
 * Usa HMAC-SHA256 con la stessa chiave così è pseudonimizzato
 */
import { createHmac } from 'crypto'

export function searchableHash(value: string): string {
  return createHmac('sha256', getKey())
    .update(value.toUpperCase().trim())
    .digest('hex')
}
