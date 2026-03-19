// src/utils/crypto.ts — AES-256-GCM
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { env } from '../config/env.js'

const ALG = 'aes-256-gcm', IV = 12, TAG = 16
const key  = () => Buffer.from(env.ENCRYPTION_KEY, 'hex')

export function enc(text: string): string {
  const iv = randomBytes(IV), c = createCipheriv(ALG, key(), iv, { authTagLength: TAG })
  const ct = Buffer.concat([c.update(text,'utf8'), c.final()])
  return [iv.toString('hex'), ct.toString('hex'), c.getAuthTag().toString('hex')].join(':')
}

export function dec(ct: string): string {
  const [ivH, encH, tagH] = ct.split(':')
  const d = createDecipheriv(ALG, key(), Buffer.from(ivH,'hex'), { authTagLength: TAG })
  d.setAuthTag(Buffer.from(tagH,'hex'))
  return Buffer.concat([d.update(Buffer.from(encH,'hex')), d.final()]).toString('utf8')
}

export function encJson(obj: unknown): string { return enc(JSON.stringify(obj)) }
export function decJson<T>(ct: string): T     { return JSON.parse(dec(ct)) }

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}
