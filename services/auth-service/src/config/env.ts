// ─────────────────────────────────────────────────────────
// src/config/env.ts — validazione env con Zod
// ─────────────────────────────────────────────────────────

import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:            z.enum(['development', 'production', 'test']).default('development'),
  PORT:                z.coerce.number().default(3001),

  // Database
  DATABASE_URL:        z.string().url(),

  // Redis
  REDIS_URL:           z.string().url(),

  // JWT
  JWT_ACCESS_SECRET:   z.string().min(32),
  COOKIE_SECRET:       z.string().min(32),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  // Cifratura dati sensibili
  ENCRYPTION_KEY:      z.string().length(64), // 32 byte hex

  // Security
  BCRYPT_ROUNDS:       z.coerce.number().default(12),
  ALLOWED_ORIGINS:     z.string().default('http://localhost:3000'),

  // MFA
  MFA_ISSUER:          z.string().default('WEB.INCLUSIVE'),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Variabili d\'ambiente non valide:')
    console.error(result.error.format())
    process.exit(1)
  }
  return result.data
}

export const env = parseEnv()
export type Env  = typeof env
