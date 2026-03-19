// src/config/env.ts
import { z } from 'zod'
const schema = z.object({
  NODE_ENV:          z.enum(['development','production','test']).default('development'),
  PORT:              z.coerce.number().default(3004),
  DATABASE_URL:      z.string().url(),
  REDIS_URL:         z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  ENCRYPTION_KEY:    z.string().length(64),
  ALLOWED_ORIGINS:   z.string().default('http://localhost:3000'),
  MINIO_ENDPOINT:    z.string().default('minio:9000'),
  MINIO_ACCESS_KEY:  z.string(),
  MINIO_SECRET_KEY:  z.string(),
  MINIO_BUCKET:      z.string().default('clinical-attachments'),
  MINIO_USE_SSL:     z.coerce.boolean().default(false),
  // Max dimensione allegato (bytes) — default 10MB
  MAX_ATTACHMENT_SIZE: z.coerce.number().default(10 * 1024 * 1024),
})
function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) { console.error('❌ ENV:', r.error.format()); process.exit(1) }
  return r.data
}
export const env = parseEnv()
