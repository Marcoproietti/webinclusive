// src/db/prisma.ts
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env.js'
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn','error'] : ['error'],
})
await prisma.$connect()

// src/db/redis.ts
import Redis from 'ioredis'
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
redis.on('error', (e) => console.error('[Redis]', e.message))

export const CacheKeys = {
  deviceSecret: (operatorId: string, deviceId: string) =>
    `device_secret:${operatorId}:${deviceId}`,
  beneficiaryCoords: (appointmentId: string) =>
    `bene_coords:${appointmentId}`,
  checkinState: (appointmentId: string) =>
    `checkin_state:${appointmentId}`,
} as const

export const QueueNames = {
  POST_CHECKOUT: 'post-checkout',
  NOTIFICATIONS: 'notifications',
} as const
