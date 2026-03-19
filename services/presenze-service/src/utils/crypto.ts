// src/utils/crypto.ts — AES-256-GCM (identico ad auth-service)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '../config/env.js'

const ALG = 'aes-256-gcm'
const IV_LEN  = 12
const TAG_LEN = 16

function key() { return Buffer.from(env.ENCRYPTION_KEY, 'hex') }

export function encryptField(text: string): string {
  const iv     = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALG, key(), iv, { authTagLength: TAG_LEN })
  const enc    = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return [iv.toString('hex'), enc.toString('hex'), cipher.getAuthTag().toString('hex')].join(':')
}

export function decryptField(ct: string): string {
  const [ivH, encH, tagH] = ct.split(':')
  const decipher = createDecipheriv(ALG, key(), Buffer.from(ivH,'hex'), { authTagLength: TAG_LEN })
  decipher.setAuthTag(Buffer.from(tagH,'hex'))
  return Buffer.concat([decipher.update(Buffer.from(encH,'hex')), decipher.final()]).toString('utf8')
}
