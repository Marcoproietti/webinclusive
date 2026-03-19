// src/db/redis.ts
import Redis from 'ioredis'
import { env } from '../config/env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // richiesto da BullMQ
  enableReadyCheck:     true,
})

redis.on('error', (e) => console.error('[Redis]', e.message))

export const QueueNames = {
  APPOINTMENT_GENERATOR: 'appointment-generator',
  NOTIFICATIONS:         'notifications',
} as const

export const CacheKeys = {
  operatorSchedule: (id: string, week: string) => `sched:op:${id}:${week}`,
  availability:     (id: string, month: string) => `avail:${id}:${month}`,
  serviceTypes:     () => 'svc_types:all',
} as const
