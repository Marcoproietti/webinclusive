// src/db/clients.ts
import { PrismaClient } from '@prisma/client'
import Redis             from 'ioredis'
import * as Minio        from 'minio'
import { env }           from '../config/env.js'

export const prisma = new PrismaClient({ log: env.NODE_ENV === 'development' ? ['warn','error'] : ['error'] })
await prisma.$connect()

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
redis.on('error', (e) => console.error('[Redis]', e.message))

export const minioClient = new Minio.Client({
  endPoint:  env.MINIO_ENDPOINT.split(':')[0],
  port:      parseInt(env.MINIO_ENDPOINT.split(':')[1] ?? '9000'),
  useSSL:    env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
})

// Assicura che il bucket esista
try {
  const exists = await minioClient.bucketExists(env.MINIO_BUCKET)
  if (!exists) {
    await minioClient.makeBucket(env.MINIO_BUCKET, 'eu-south-1')
    console.info(`[MinIO] Bucket '${env.MINIO_BUCKET}' creato`)
  }
} catch (e: any) {
  console.warn('[MinIO] Impossibile verificare bucket:', e.message)
}

export const CacheKeys = {
  clinicalRecord: (beneficiaryId: string) => `clinical:${beneficiaryId}`,
  notesList:      (beneficiaryId: string) => `notes:${beneficiaryId}`,
} as const
