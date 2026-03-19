// ─────────────────────────────────────────────────────────
// src/index.ts — scheduling-service bootstrap
// ─────────────────────────────────────────────────────────

import Fastify    from 'fastify'
import cors       from '@fastify/cors'
import helmet     from '@fastify/helmet'
import rateLimit  from '@fastify/rate-limit'
import jwt        from '@fastify/jwt'

import { env }                  from './config/env.js'
import { prisma }               from './db/prisma.js'
import { redis }                from './db/redis.js'
import { errorHandler }         from './middleware/error-handler.js'
import { jwtAuthMiddleware }    from './middleware/jwt-auth.js'

import { beneficiaryRoutes }    from './routes/beneficiary.routes.js'
import { carePlanRoutes }       from './routes/care-plan.routes.js'
import { appointmentRoutes }    from './routes/appointment.routes.js'
import { shiftRoutes }          from './routes/shift.routes.js'
import { availabilityRoutes }   from './routes/availability.routes.js'
import { messageRoutes }        from './routes/message.routes.js'
import { serviceTypeRoutes }    from './routes/service-type.routes.js'
import { healthRoutes }         from './routes/health.routes.js'
import { AppointmentSyncWorker } from './workers/appointment-sync.worker.js'

// ── Build app ─────────────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger:     env.NODE_ENV !== 'test',
    trustProxy: true,
    genReqId:   () => crypto.randomUUID(),
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin:      env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 200, timeWindow: '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip,
  })
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    verify: { issuer: 'webinclusive-auth' },
  })

  // Decorator: verifica JWT su ogni route protetta
  app.decorate('authenticate', jwtAuthMiddleware)
  app.setErrorHandler(errorHandler)

  // ── Routes ────────────────────────────────────────────
  await app.register(healthRoutes,       { prefix: '/health' })
  await app.register(serviceTypeRoutes,  { prefix: '/api/v1/service-types' })
  await app.register(beneficiaryRoutes,  { prefix: '/api/v1/beneficiaries' })
  await app.register(carePlanRoutes,     { prefix: '/api/v1/care-plans' })
  await app.register(appointmentRoutes,  { prefix: '/api/v1/appointments' })
  await app.register(shiftRoutes,        { prefix: '/api/v1/shifts' })
  await app.register(availabilityRoutes, { prefix: '/api/v1/availability' })
  await app.register(messageRoutes,      { prefix: '/api/v1/messages' })

  // ── BullMQ Worker ─────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    AppointmentSyncWorker.start()
  }

  // ── Graceful shutdown ─────────────────────────────────
  const shutdown = async () => {
    app.log.info('Shutdown scheduling-service...')
    await AppointmentSyncWorker.stop()
    await app.close()
    await prisma.$disconnect()
    await redis.quit()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  return app
}

// ── Start ─────────────────────────────────────────────────

const app = await buildApp()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`scheduling-service avviato su porta ${env.PORT}`)
