// src/utils/crypto.ts — chiave WB separata
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'
import { env } from '../config/env.js'

const ALG = 'aes-256-gcm', IV = 12, TAG = 16
const key = () => Buffer.from(env.WB_ENCRYPTION_KEY, 'hex')

export function enc(text: string): string {
  const iv = randomBytes(IV)
  const c  = createCipheriv(ALG, key(), iv, { authTagLength: TAG })
  const ct = Buffer.concat([c.update(text,'utf8'), c.final()])
  return [iv.toString('hex'), ct.toString('hex'), c.getAuthTag().toString('hex')].join(':')
}

export function dec(ct: string): string {
  const [ivH, encH, tagH] = ct.split(':')
  const d = createDecipheriv(ALG, key(), Buffer.from(ivH,'hex'), { authTagLength: TAG })
  d.setAuthTag(Buffer.from(tagH,'hex'))
  return Buffer.concat([d.update(Buffer.from(encH,'hex')), d.final()]).toString('utf8')
}

// HMAC irreversibile del segnalante (solo per de-duplicazione)
export function hmacReporter(identifier: string): string {
  return createHmac('sha256', env.WB_REPORTER_HMAC_KEY)
    .update(identifier.toLowerCase().trim())
    .digest('hex')
}

// Genera codice di tracking random (non collegabile all'identità)
export function generateTrackingCode(): string {
  return randomBytes(16).toString('hex').toUpperCase() // 32 char hex
}

// src/db/prisma.ts
import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient({ log: ['error'] })
await prisma.$connect()
