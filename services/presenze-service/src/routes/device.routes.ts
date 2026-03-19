// src/routes/device.routes.ts
import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma }               from '../db/clients.js'
import { proofService }         from '../services/proof-of-presence.service.js'

export async function deviceRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // POST /devices — Registra device (al primo login su nuovo dispositivo)
  fastify.post('/', async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = z.object({
      device_id:     z.string().min(1),
      device_secret: z.string().length(64), // 32 byte hex — generato al momento dell'onboarding
      device_name:   z.string().optional(),
      platform:      z.enum(['android', 'ios']).optional(),
    }).parse(req.body)

    await proofService.registerDevice({
      operatorId:   caller.sub,
      deviceId:     body.device_id,
      deviceSecret: body.device_secret,
      deviceName:   body.device_name,
      platform:     body.platform,
    })

    return reply.code(201).send({ message: 'Device registrato.' })
  })

  // GET /devices — Lista dispositivi registrati
  fastify.get('/', async (req, reply) => {
    const caller  = req.user as { sub: string }
    const devices = await prisma.deviceRegistry.findMany({
      where:  { operatorId: caller.sub, isActive: true },
      select: {
        id: true, deviceId: true, deviceName: true,
        platform: true, lastUsedAt: true, createdAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    })
    return reply.send(devices)
  })

  // DELETE /devices/:deviceId — Revoca device
  fastify.delete<{ Params: { deviceId: string } }>('/:deviceId', async (req, reply) => {
    const caller = req.user as { sub: string }
    await proofService.revokeDevice(caller.sub, req.params.deviceId)
    return reply.send({ message: 'Device revocato.' })
  })
}
