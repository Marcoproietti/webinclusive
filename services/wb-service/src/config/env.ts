// src/config/env.ts
import { z } from 'zod'
const schema = z.object({
  NODE_ENV:           z.enum(['development','production','test']).default('development'),
  PORT:               z.coerce.number().default(3007),
  WB_DATABASE_URL:    z.string().url(),
  JWT_ACCESS_SECRET:  z.string().min(32),
  WB_ENCRYPTION_KEY:  z.string().length(64), // chiave SEPARATA
  ALLOWED_ORIGINS:    z.string().default('http://localhost:3000'),
  // HMAC key per anonimizzazione segnalante (irreversibile)
  WB_REPORTER_HMAC_KEY: z.string().min(32),
})
function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) { console.error('❌ ENV:', r.error.format()); process.exit(1) }
  return r.data
}
export const env = parseEnv()
