// ─────────────────────────────────────────────────────────
// src/workers/appointment-sync.worker.ts
// BullMQ worker: genera appuntamenti in background,
// invia notifiche push per nuovi turni/appuntamenti
// ─────────────────────────────────────────────────────────

import { Worker, Queue, QueueEvents } from 'bullmq'
import { redis, QueueNames }          from '../db/redis.js'
import { plannerService }             from '../services/planner.service.js'
import { prisma }                     from '../db/prisma.js'

// ── Tipi job ─────────────────────────────────────────────

export type AppointmentGeneratorJob =
  | {
      type:        'GENERATE_FROM_PLAN'
      carePlanId:  string
      operatorId:  string
      from:        string   // ISO date
      to:          string
      createdBy:   string
    }
  | {
      type:              'CANCEL_MISSED_APPOINTMENTS'
      cutoffIso:         string
    }
  | {
      type:    'NOTIFY_UPCOMING'
      hours:   number   // notifica X ore prima
    }

// ── Queue ─────────────────────────────────────────────────

export const appointmentQueue = new Queue<AppointmentGeneratorJob>(
  QueueNames.APPOINTMENT_GENERATOR,
  { connection: redis }
)

// ── Worker ────────────────────────────────────────────────

let worker: Worker | null = null

export class AppointmentSyncWorker {

  static start(): void {
    worker = new Worker<AppointmentGeneratorJob>(
      QueueNames.APPOINTMENT_GENERATOR,
      async (job) => {
        switch (job.data.type) {

          // ── Genera appuntamenti da piano ──────────────
          case 'GENERATE_FROM_PLAN': {
            const { carePlanId, operatorId, from, to, createdBy } = job.data
            console.info(`[Worker] Generazione piano ${carePlanId}`)

            const result = await plannerService.generateFromPlan({
              carePlanId,
              operatorId,
              from:     new Date(from),
              to:       new Date(to),
              createdBy,
            })

            console.info(`[Worker] Generati ${result.generated}, conflitti ${result.conflicts}`)

            // Emetti notifica al coordinatore (via notify-service)
            await appointmentQueue.add(
              'notify-plan-generated',
              {
                type:  'NOTIFY_UPCOMING',
                hours: 0,
              },
              { delay: 0 }
            )
            return result
          }

          // ── Marca come missed appuntamenti scaduti ────
          case 'CANCEL_MISSED_APPOINTMENTS': {
            const cutoff = new Date(job.data.cutoffIso)
            const { count } = await prisma.appointment.updateMany({
              where: {
                status:         'confirmed',
                scheduledEnd:   { lt: cutoff },
              },
              data: { status: 'missed' },
            })
            console.info(`[Worker] ${count} appuntamenti marcati come missed`)
            return { count }
          }

          // ── Notifica appuntamenti imminenti ───────────
          case 'NOTIFY_UPCOMING': {
            const { hours } = job.data
            const now  = new Date()
            const from = new Date(now.getTime() + hours * 3600000)
            const to   = new Date(from.getTime() + 3600000)        // finestra 1h

            const upcoming = await prisma.appointment.findMany({
              where: {
                status:         { in: ['scheduled', 'confirmed'] },
                scheduledStart: { gte: from, lt: to },
              },
              include: {
                carePlan: { include: { beneficiary: { select: { id: true, address: true } } } },
                serviceType: { select: { name: true } },
              },
            })

            console.info(`[Worker] ${upcoming.length} appuntamenti imminenti in ${hours}h`)

            // Per ogni appuntamento → pubblica su coda notify-service
            const notifyQueue = new Queue(QueueNames.NOTIFICATIONS, { connection: redis })
            for (const appt of upcoming) {
              await notifyQueue.add('push-appointment-reminder', {
                operatorId:  appt.operatorId,
                appointmentId: appt.id,
                scheduledStart: appt.scheduledStart.toISOString(),
                serviceName:   appt.serviceType.name,
              })
            }
            return { notified: upcoming.length }
          }
        }
      },
      {
        connection:  redis,
        concurrency: 2,
        limiter:     { max: 10, duration: 1000 },
      }
    )

    worker.on('completed', (job, result) => {
      console.info(`[Worker] Job ${job.id} completato`, result)
    })

    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} fallito:`, err.message)
    })

    // ── Cron: marca missed ogni 30 min ────────────────
    appointmentQueue.add(
      'cron-cancel-missed',
      { type: 'CANCEL_MISSED_APPOINTMENTS', cutoffIso: new Date().toISOString() },
      {
        repeat: { every: 30 * 60 * 1000 },
        jobId:  'cron-cancel-missed',
      }
    )

    // ── Cron: notifica 24h prima ogni ora ─────────────
    appointmentQueue.add(
      'cron-notify-24h',
      { type: 'NOTIFY_UPCOMING', hours: 24 },
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId:  'cron-notify-24h',
      }
    )

    // ── Cron: notifica 1h prima ogni 30 min ──────────
    appointmentQueue.add(
      'cron-notify-1h',
      { type: 'NOTIFY_UPCOMING', hours: 1 },
      {
        repeat: { every: 30 * 60 * 1000 },
        jobId:  'cron-notify-1h',
      }
    )

    console.info('[Worker] AppointmentSyncWorker avviato')
  }

  static async stop(): Promise<void> {
    if (worker) {
      await worker.close()
      worker = null
      console.info('[Worker] AppointmentSyncWorker fermato')
    }
  }
}
