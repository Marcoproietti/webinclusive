// src/index.ts — notify-service
// Servizio worker-only: nessuna route HTTP esposta al traffico
// tranne /health e un endpoint interno per trigger manuali
import Fastify  from 'fastify'
import helmet   from '@fastify/helmet'
import Redis    from 'ioredis'
import { env }  from './config/env.js'
import { NotifyWorker } from './workers/notify.worker.js'

const app   = Fastify({ logger: env.NODE_ENV !== 'test' })
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 })

await app.register(helmet, { contentSecurityPolicy: false })

app.get('/health', async (_req, reply) => {
  const redisOk = await redis.ping().then(() => true).catch(() => false)
  return reply.code(redisOk ? 200 : 503).send({
    status:  redisOk ? 'ok' : 'degraded',
    service: 'notify-service',
    checks:  { redis: redisOk ? 'ok' : 'error' },
  })
})

NotifyWorker.start()

const shutdown = async () => {
  await NotifyWorker.stop()
  await app.close()
  await redis.quit()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)

await app.listen({ port: env.PORT, host: '0.0.0.0' })
app.log.info(`notify-service avviato su porta ${env.PORT}`)
