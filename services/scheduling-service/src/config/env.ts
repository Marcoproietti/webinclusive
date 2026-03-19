// src/config/env.ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:          z.enum(['development', 'production', 'test']).default('development'),
  PORT:              z.coerce.number().default(3002),
  DATABASE_URL:      z.string().url(),
  REDIS_URL:         z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  ENCRYPTION_KEY:    z.string().length(64),
  ALLOWED_ORIGINS:   z.string().default('http://localhost:3000'),
  // Fuso orario per generazione appuntamenti
  TZ:                z.string().default('Europe/Rome'),
  // Massimo appuntamenti generabili in una singola operazione
  MAX_APPT_GENERATE: z.coerce.number().default(365),
})

function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) {
    console.error('❌ ENV non valide:', r.error.format())
    process.exit(1)
  }
  return r.data
}

export const env = parseEnv()
