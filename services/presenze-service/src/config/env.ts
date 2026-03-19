// src/config/env.ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:               z.enum(['development','production','test']).default('development'),
  PORT:                   z.coerce.number().default(3003),
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string().url(),
  JWT_ACCESS_SECRET:      z.string().min(32),
  ENCRYPTION_KEY:         z.string().length(64),
  ALLOWED_ORIGINS:        z.string().default('http://localhost:3000'),

  // Geofence: raggio massimo check-in dal beneficiario (metri)
  GEOFENCE_RADIUS_METERS: z.coerce.number().default(200),

  // Massimo ore per sync offline
  OFFLINE_SYNC_MAX_HOURS: z.coerce.number().default(2),

  // Scheduling service URL (chiamate interne)
  SCHEDULING_SERVICE_URL: z.string().default('http://scheduling-service:3002'),
  AUTH_SERVICE_URL:       z.string().default('http://auth-service:3001'),
})

function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) { console.error('❌ ENV non valide:', r.error.format()); process.exit(1) }
  return r.data
}

export const env = parseEnv()
