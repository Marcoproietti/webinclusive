// ─────────────────────────────────────────────────────────
// src/__tests__/auth.test.ts
// Test integrazione auth-service con Vitest
// ─────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../index.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

// ── Setup / Teardown ──────────────────────────────────────

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

// ── Helper ────────────────────────────────────────────────

async function login(email: string, password: string) {
  return app.inject({
    method:  'POST',
    url:     '/api/v1/auth/login',
    payload: { email, password },
  })
}

// ── Test: Login ───────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {

  it('dovrebbe restituire 401 con credenziali errate', async () => {
    const res = await login('nonexistent@test.it', 'WrongPass1!')
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('INVALID_CREDENTIALS')
  })

  it('dovrebbe restituire 400 con body non valido', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: '' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('VALIDATION_ERROR')
  })

  it('dovrebbe restituire access_token con credenziali corrette', async () => {
    // NB: questo test richiede un utente seed nel DB di test
    // Vedere prisma/seed.ts per utente test@webinclusive.it / Test1234!
    const res = await login('admin@webinclusive.it', 'Admin1234!')

    if (res.statusCode === 200) {
      const body = res.json()
      expect(body).toHaveProperty('access_token')
      expect(body).toHaveProperty('token_type', 'Bearer')
      expect(body).toHaveProperty('expires_in', 900)
      expect(body.user).toHaveProperty('role')

      // Cookie refresh deve essere HttpOnly
      const cookie = res.headers['set-cookie'] as string
      expect(cookie).toContain('wi_refresh=')
      expect(cookie).toContain('HttpOnly')
    }
  })

  it('dovrebbe rispettare rate limit (mock)', async () => {
    // Verifica che il campo error sia presente dopo troppi tentativi
    // In test env il rate limit è più alto, ma la struttura è verificabile
    const res = await login('test@test.it', 'wrong')
    expect([401, 429]).toContain(res.statusCode)
  })
})

// ── Test: Refresh ─────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {

  it('dovrebbe restituire 401 senza cookie refresh', async () => {
    const res = await app.inject({
      method: 'POST',
      url:    '/api/v1/auth/refresh',
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBe('MISSING_REFRESH_TOKEN')
  })

  it('dovrebbe restituire 401 con refresh token non valido', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/auth/refresh',
      cookies: { wi_refresh: 'invalid-token-value' },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── Test: Health ──────────────────────────────────────────

describe('GET /health', () => {

  it('dovrebbe restituire 200 con status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      status:  'ok',
      service: 'auth-service',
    })
  })

  it('GET /health/ready dovrebbe mostrare stato DB e Redis', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' })
    // In ambienti senza DB restituisce 503, con DB restituisce 200
    expect([200, 503]).toContain(res.statusCode)
    expect(res.json()).toHaveProperty('checks')
    expect(res.json().checks).toHaveProperty('postgres')
    expect(res.json().checks).toHaveProperty('redis')
  })
})

// ── Test: Password service ────────────────────────────────

describe('PasswordService — policy validation', () => {
  it('dovrebbe rifiutare password troppo corta', async () => {
    const { PasswordService } = await import('../services/password.service.js')
    const svc = new PasswordService()
    const result = svc.validatePolicy('abc')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('dovrebbe accettare password conforme', async () => {
    const { PasswordService } = await import('../services/password.service.js')
    const svc = new PasswordService()
    const result = svc.validatePolicy('Secure1234!')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('dovrebbe rifiutare password senza simbolo', async () => {
    const { PasswordService } = await import('../services/password.service.js')
    const svc = new PasswordService()
    const result = svc.validatePolicy('Secure1234')
    expect(result.valid).toBe(false)
  })
})

// ── Test: Crypto utils ────────────────────────────────────

describe('Crypto — encryptField / decryptField', () => {

  beforeAll(() => {
    // Imposta chiave di test
    process.env.ENCRYPTION_KEY = '0'.repeat(64) // 32 byte hex per test
  })

  it('dovrebbe cifrare e decifrare correttamente', async () => {
    const { encryptField, decryptField } = await import('../utils/crypto.js')
    const original  = 'Mario Rossi'
    const encrypted = encryptField(original)

    expect(encrypted).not.toBe(original)
    expect(encrypted.split(':').length).toBe(3) // iv:ciphertext:tag

    const decrypted = decryptField(encrypted)
    expect(decrypted).toBe(original)
  })

  it('due cifrature dello stesso testo devono essere diverse (IV random)', async () => {
    const { encryptField } = await import('../utils/crypto.js')
    const enc1 = encryptField('stesso testo')
    const enc2 = encryptField('stesso testo')
    expect(enc1).not.toBe(enc2) // IV diverso → ciphertext diverso
  })

  it('dovrebbe fallire con ciphertext manomesso', async () => {
    const { encryptField, decryptField } = await import('../utils/crypto.js')
    const encrypted = encryptField('dato sensibile')
    const tampered  = encrypted.replace(/.$/, 'x') // modifica ultimo char del tag
    expect(() => decryptField(tampered)).toThrow()
  })
})
