// src/__tests__/presenze.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../index.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => { app = await buildApp(); await app.ready() })
afterAll(async () => { await app.close() })

describe('GeofenceService', () => {
  it('calcola distanza corretta tra due punti', async () => {
    const { GeofenceService } = await import('../services/geofence.service.js')
    const svc = new GeofenceService()

    // Roma centro → Colosseo (~700m)
    const dist = svc.distanceMeters(
      { lat: 41.8955,  lng: 12.4823 },
      { lat: 41.8902,  lng: 12.4922 }
    )
    expect(dist).toBeGreaterThan(500)
    expect(dist).toBeLessThan(1500)
  })

  it('approva check-in entro 200m', async () => {
    const { GeofenceService } = await import('../services/geofence.service.js')
    const svc = new GeofenceService()
    const result = svc.check(
      { lat: 41.9000, lng: 12.4900 },
      { lat: 41.9001, lng: 12.4901 }  // ~15m
    )
    expect(result.ok).toBe(true)
    expect(result.distanceMeters).toBeLessThan(200)
  })

  it('rifiuta check-in oltre 200m', async () => {
    const { GeofenceService } = await import('../services/geofence.service.js')
    const svc = new GeofenceService()
    const result = svc.check(
      { lat: 41.9000, lng: 12.4900 },
      { lat: 41.9030, lng: 12.4950 }  // ~450m
    )
    expect(result.ok).toBe(false)
    expect(result.distanceMeters).toBeGreaterThan(200)
  })
})

describe('ProofOfPresenceService', () => {
  it('rifiuta payload con timestamp troppo vecchio', async () => {
    const { ProofOfPresenceService } = await import('../services/proof-of-presence.service.js')
    const svc = new ProofOfPresenceService()

    const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 min fa

    const result = await svc.verify(
      {
        appointmentId: crypto.randomUUID(),
        operatorId:    crypto.randomUUID(),
        lat:           41.9,
        lng:           12.4,
        timestamp:     oldTimestamp,
        type:          'checkin',
      },
      'a'.repeat(64), // firma qualsiasi
      'device-001'
    )

    // Fallisce per device non registrato o timestamp vecchio
    expect(result.valid).toBe(false)
    expect(['DEVICE_NOT_REGISTERED', 'TIMESTAMP_TOO_OLD_OR_FUTURE']).toContain(result.reason)
  })
})

describe('GET /health', () => {
  it('restituisce 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().service).toBe('presenze-service')
  })
})

describe('POST /api/v1/attendance/checkin — auth guard', () => {
  it('restituisce 401 senza JWT', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/attendance/checkin',
      payload: { appointment_id: crypto.randomUUID() },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/v1/attendance/sync — validazione', () => {
  it('restituisce 401 senza JWT', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/v1/attendance/sync',
      payload: { records: [] },
    })
    expect(res.statusCode).toBe(401)
  })
})
