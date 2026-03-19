// src/index.ts — hr-service
import Fastify   from 'fastify'
import cors      from '@fastify/cors'
import helmet    from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt       from '@fastify/jwt'
import { PrismaClient } from '@prisma/client'
import { env }   from './config/env.js'
import { trainingRoutes, qualityRoutes } from './routes/hr.routes.js'

const prisma = new PrismaClient()
await prisma.$connect()

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== 'test', trustProxy: true })
  await app.register(helmet,    { contentSecurityPolicy: false })
  await app.register(cors,      { origin: env.ALLOWED_ORIGINS.split(','), credentials: true })
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })
  await app.register(jwt,       { secret: env.JWT_ACCESS_SECRET, verify: { issuer: 'webinclusive-auth' } })

  app.decorate('authenticate', async (req: any, reply: any) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: 'UNAUTHORIZED' }) }
  })

  app.setErrorHandler((err, req, reply) => {
    req.log?.error({ err })
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? 'INTERNAL_SERVER_ERROR' })
  })

  app.get('/health', async (_req, reply) => reply.send({ status:'ok', service:'hr-service' }))

  await app.register(trainingRoutes, { prefix: '/api/v1/trainings' })
  await app.register(qualityRoutes,  { prefix: '/api/v1/quality' })

  const shutdown = async () => { await app.close(); await prisma.$disconnect(); process.exit(0) }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
  return app
}

const app = await buildApp()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`hr-service avviato su porta ${env.PORT}`)
