// src/config/env.ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV:   z.enum(['development','production','test']).default('development'),
  PORT:       z.coerce.number().default(3006),
  REDIS_URL:  z.string().url(),

  // Firebase (FCM per Android + web)
  FIREBASE_PROJECT_ID:    z.string().optional(),
  FIREBASE_CLIENT_EMAIL:  z.string().optional(),
  FIREBASE_PRIVATE_KEY:   z.string().optional(),

  // APNS (iOS)
  APNS_KEY_ID:   z.string().optional(),
  APNS_TEAM_ID:  z.string().optional(),
  APNS_BUNDLE_ID:z.string().default('it.webinclusive.operators'),

  // SMTP email
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@webinclusive.it'),

  // Auth service URL per recuperare device token
  AUTH_SERVICE_URL: z.string().default('http://auth-service:3001'),
})

function parseEnv() {
  const r = schema.safeParse(process.env)
  if (!r.success) { console.error('❌ ENV:', r.error.format()); process.exit(1) }
  return r.data
}
export const env = parseEnv()
