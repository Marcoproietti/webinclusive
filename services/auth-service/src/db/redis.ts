// src/db/redis.ts — singleton ioredis client
import Redis from 'ioredis'
import { env } from '../config/env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck:     true,
  lazyConnect:          false,
})

redis.on('error', (err) => {
  console.error('[Redis] Errore connessione:', err.message)
})

redis.on('connect', () => {
  console.info('[Redis] Connesso')
})

// ── Chiavi Redis standardizzate ───────────────────────────

export const RedisKeys = {
  refreshToken:  (userId: string, jti: string) => `rt:${userId}:${jti}`,
  allTokens:     (userId: string)              => `rt:${userId}:*`,
  mfaPending:    (userId: string)              => `mfa_pending:${userId}`,
  loginAttempts: (ip: string)                  => `login_attempts:${ip}`,
  pwdResetToken: (token: string)               => `pwd_reset:${token}`,
} as const
