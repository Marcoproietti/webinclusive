// ─────────────────────────────────────────────────────────
// src/workers/post-checkout.worker.ts
// Azioni asincrone dopo ogni checkout:
// 1. Aggiorna appointment.status → completed
// 2. Calcola scostamento durata pianificata vs effettiva
// 3. Notifica push al caregiver
// 4. Notifica push al coordinatore se anomalie
// ─────────────────────────────────────────────────────────

import { Worker, Queue } from 'bullmq'
import { redis, QueueNames } from '../db/clients.js'
import { prisma }            from '../db/clients.js'
import { env }               from '../config/env.js'

interface PostCheckoutJob {
  attendanceId:  string
  appointmentId: string
  operatorId:    string
  durationMin:   number
  checkOutAt:    string
}

let worker: Worker | null = null

export class PostCheckoutWorker {

  static start(): void {
    worker = new Worker<PostCheckoutJob>(
      QueueNames.POST_CHECKOUT,
      async (job) => {
        const { attendanceId, appointmentId, operatorId, durationMin } = job.data

        console.info(`[PostCheckout] Elaborazione checkout ${attendanceId}`)

        // 1. Aggiorna stato appuntamento → completed
        try {
          await fetch(
            `${env.SCHEDULING_SERVICE_URL}/api/v1/appointments/${appointmentId}/status`,
            {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
              body:    JSON.stringify({ status: 'completed' }),
            }
          )
        } catch (err) {
          console.error('[PostCheckout] Aggiornamento appuntamento fallito:', err)
        }

        // 2. Calcola scostamento durata
        let plannedDurationMin: number | null = null
        try {
          const res  = await fetch(
            `${env.SCHEDULING_SERVICE_URL}/api/v1/appointments/${appointmentId}`,
            { headers: { 'x-internal': 'true' } }
          )
          if (res.ok) {
            const appt: any = await res.json()
            plannedDurationMin = Math.round(
              (new Date(appt.scheduledEnd).getTime() -
               new Date(appt.scheduledStart).getTime()) / 60000
            )
          }
        } catch {}

        const deviation = plannedDurationMin
          ? durationMin - plannedDurationMin
          : null

        // 3. Costruisce payload notifiche
        const notifyQueue = new Queue(QueueNames.NOTIFICATIONS, { connection: redis })

        // 3a. Notifica caregiver: servizio concluso
        await notifyQueue.add('push-caregiver-checkout', {
          type:          'CAREGIVER_SERVICE_COMPLETED',
          appointmentId,
          operatorId,
          durationMin,
          checkOutAt:    job.data.checkOutAt,
        })

        // 3b. Se deviazione > 20 min → notifica coordinatore
        if (deviation !== null && Math.abs(deviation) > 20) {
          await notifyQueue.add('push-coordinator-deviation', {
            type:             'DURATION_DEVIATION',
            attendanceId,
            appointmentId,
            plannedMin:       plannedDurationMin,
            effectiveMin:     durationMin,
            deviationMin:     deviation,
          })
          console.warn(
            `[PostCheckout] Deviazione durata: pianificato ${plannedDurationMin}min, ` +
            `effettivo ${durationMin}min (Δ${deviation}min)`
          )
        }

        // 4. Aggiorna statistiche operatore in Redis (cache aggregata)
        const monthKey = `stats:op:${operatorId}:${job.data.checkOutAt.slice(0,7)}`
        await redis.hincrby(monthKey, 'total_visits',  1)
        await redis.hincrby(monthKey, 'total_min',     durationMin)
        await redis.expire(monthKey, 90 * 24 * 3600) // 90 giorni

        return { processed: true, deviation }
      },
      {
        connection:  redis,
        concurrency: 5,
        limiter:     { max: 20, duration: 1000 },
      }
    )

    worker.on('completed', (job) => {
      console.info(`[PostCheckout] Job ${job.id} completato`)
    })
    worker.on('failed', (job, err) => {
      console.error(`[PostCheckout] Job ${job?.id} fallito:`, err.message)
    })

    console.info('[Worker] PostCheckoutWorker avviato')
  }

  static async stop(): Promise<void> {
    if (worker) {
      await worker.close()
      worker = null
    }
  }
}
