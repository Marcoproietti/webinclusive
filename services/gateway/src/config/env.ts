// src/config/env.ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:          z.enum(['development','production','test']).default('development'),
  PORT:              z.coerce.number().default(3000),
  JWT_ACCESS_SECRET: z.string().min(32),
  COOKIE_SECRET:     z.string().min(32),
  REDIS_URL:         z.string().url(),
  ALLOWED_ORIGINS:   z.string().default('http://localhost:5173'),

  // Upstream services (rete Docker interna)
  AUTH_SERVICE_URL:       z.string().default('http://auth-service:3001'),
  SCHEDULING_SERVICE_URL: z.string().default('http://scheduling-service:3002'),
  PRESENZE_SERVICE_URL:   z.string().default('http://presenze-service:3003'),
  CARTELLA_SERVICE_URL:   z.string().default('http://cartella-service:3004'),
  HR_SERVICE_URL:         z.string().default('http://hr-service:3005'),
  NOTIFY_SERVICE_URL:     z.string().default('http://notify-service:3006'),
  WB_SERVICE_URL:         z.string().default('http://wb-service:3007'),

  // Rate limiting
  RATE_LIMIT_MAX:     z.coerce.number().default(100),
  RATE_LIMIT_AUTH_MAX:z.coerce.number().default(10),
})

function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) { console.error('❌ ENV non valide:', r.error.format()); process.exit(1) }
  return r.data
}
export const env = parseEnv()
