// ─── src/config/env.ts ───────────────────────────────────
import { z } from 'zod'
const schema = z.object({
  NODE_ENV: z.enum(['development','production','test']).default('development'),
  PORT: z.coerce.number().default(3005),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
})
function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) { console.error('❌ ENV:', r.error.format()); process.exit(1) }
  return r.data
}
export const env = parseEnv()
