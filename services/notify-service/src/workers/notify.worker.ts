// ─────────────────────────────────────────────────────────
// src/workers/notify.worker.ts
// BullMQ worker: processa tutti i job di notifica
// dalla coda 'notifications' pubblicata dai microservizi
// ─────────────────────────────────────────────────────────

import { Worker, Queue } from 'bullmq'
import Redis              from 'ioredis'
import { env }            from '../config/env.js'
import { sendFcm, sendFcmMulticast, type PushPayload } from '../providers/fcm.provider.js'
import { sendEmail, templateClinicalAlert }             from '../providers/email.provider.js'

const QUEUE_NAME = 'notifications'

// ── Tipi job ──────────────────────────────────────────────

type NotifyJobType =
  | 'push-appointment-reminder'
  | 'push-caregiver-checkout'
  | 'push-coordinator-deviation'
  | 'push-clinical-alert'
  | 'push-message-new'
  | 'push-shift-published'
  | 'email-welcome'
  | 'email-clinical-alert'
  | 'email-password-reset'

interface BaseJob { type: NotifyJobType }

interface PushReminderJob extends BaseJob {
  type:           'push-appointment-reminder'
  operatorId:     string
  appointmentId:  string
  scheduledStart: string
  serviceName:    string
}

interface PushCaregiverCheckoutJob extends BaseJob {
  type:          'push-caregiver-checkout'
  appointmentId: string
  operatorId:    string
  durationMin:   number
  checkOutAt:    string
}

interface PushDeviationJob extends BaseJob {
  type:         'push-coordinator-deviation'
  attendanceId: string
  appointmentId:string
  plannedMin:   number
  effectiveMin: number
  deviationMin: number
}

interface PushClinicalAlertJob extends BaseJob {
  type:          'push-clinical-alert'
  attendanceId:  string
  appointmentId: string
  operatorId:    string
  alerts:        string[]
  painScale?:    number
}

interface PushMessageJob extends BaseJob {
  type:           'push-message-new'
  receiverUserId: string
  senderName:     string
  preview:        string   // primi 80 char del messaggio
}

interface EmailWelcomeJob extends BaseJob {
  type:         'email-welcome'
  to:           string
  operatorName: string
  tempPassword: string
}

type NotifyJob =
  | PushReminderJob | PushCaregiverCheckoutJob | PushDeviationJob
  | PushClinicalAlertJob | PushMessageJob | EmailWelcomeJob

// ── Recupera device token dall'auth-service ───────────────

async function getDeviceToken(operatorId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${env.AUTH_SERVICE_URL}/api/v1/operators/${operatorId}`,
      { headers: { 'x-internal': 'true' } }
    )
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.operator?.deviceToken ?? null
  } catch {
    return null
  }
}

// ── Worker ────────────────────────────────────────────────

let worker: Worker | null = null

export class NotifyWorker {

  static start(): void {
    const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

    worker = new Worker<NotifyJob>(
      QUEUE_NAME,
      async (job) => {
        const data = job.data
        console.info(`[Notify] Job: ${data.type} (${job.id})`)

        switch (data.type) {

          // ── Push: promemoria appuntamento ──────────────
          case 'push-appointment-reminder': {
            const token = await getDeviceToken(data.operatorId)
            if (!token) break

            const dt = new Date(data.scheduledStart)
            const timeStr = dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })

            await sendFcm({
              token,
              title: '📅 Appuntamento imminente',
              body:  `${data.serviceName} alle ${timeStr}`,
              data:  {
                type:          'appointment_reminder',
                appointmentId: data.appointmentId,
                click_action:  'APPOINTMENT_DETAIL',
              },
            })
            break
          }

          // ── Push: caregiver — servizio completato ──────
          case 'push-caregiver-checkout': {
            // Recupera token caregiver legato all'appuntamento
            // (via scheduling-service → beneficiary → caregiver)
            console.info(`[Notify] Servizio completato per appuntamento ${data.appointmentId} — durata ${data.durationMin}min`)
            // TODO: recuperare device token caregiver e inviare push
            break
          }

          // ── Push: coordinatore — deviazione durata ─────
          case 'push-coordinator-deviation': {
            const sign = data.deviationMin > 0 ? '+' : ''
            console.warn(
              `[Notify] Deviazione durata: pianificato ${data.plannedMin}min, ` +
              `effettivo ${data.effectiveMin}min (${sign}${data.deviationMin}min)`
            )
            // Broadcast a tutti i coordinatori connessi via WS Redis pub/sub
            const publisher = new Redis(env.REDIS_URL)
            await publisher.publish('wi:appointment_update', JSON.stringify({
              type:         'DURATION_DEVIATION',
              appointmentId: data.appointmentId,
              plannedMin:   data.plannedMin,
              effectiveMin: data.effectiveMin,
              deviationMin: data.deviationMin,
            }))
            await publisher.quit()
            break
          }

          // ── Push + Email: alert clinico ────────────────
          case 'push-clinical-alert': {
            // 1. Pubblica su Redis WS per coordinatori connessi
            const publisher = new Redis(env.REDIS_URL)
            await publisher.publish('wi:clinical_alert', JSON.stringify({
              attendanceId:  data.attendanceId,
              appointmentId: data.appointmentId,
              operatorId:    data.operatorId,
              alerts:        data.alerts,
              painScale:     data.painScale,
              ts:            new Date().toISOString(),
            }))
            await publisher.quit()

            // 2. Email al coordinatore responsabile
            // (recuperare email coordinatore dal DB)
            console.warn('[Notify] Clinical alert emesso:', data.alerts)
            break
          }

          // ── Push: nuovo messaggio ──────────────────────
          case 'push-message-new': {
            const token = await getDeviceToken(data.receiverUserId)
            if (!token) break

            await sendFcm({
              token,
              title: `💬 Messaggio da ${data.senderName}`,
              body:  data.preview,
              data: {
                type:      'message_new',
                userId:    data.receiverUserId,
                click_action: 'MESSAGES',
              },
            })
            break
          }

          // ── Email: benvenuto nuovo operatore ──────────
          case 'email-welcome': {
            const { templateWelcome } = await import('../providers/email.provider.js')
            await sendEmail({
              to:      data.to,
              subject: 'Benvenuto/a su WEB.INCLUSIVE',
              html:    templateWelcome(data.operatorName, data.tempPassword),
              text:    `Benvenuto/a ${data.operatorName}. Password temporanea: ${data.tempPassword}`,
            })
            break
          }
        }
      },
      {
        connection:  redis,
        concurrency: 10,
        limiter:     { max: 50, duration: 1000 },
        defaultJobOptions: {
          attempts:  3,
          backoff:   { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail:     { count: 500 },
        },
      }
    )

    worker.on('completed', (job) => {
      console.info(`[Notify] ✅ ${job.data.type} (${job.id})`)
    })
    worker.on('failed', (job, err) => {
      console.error(`[Notify] ❌ ${job?.data?.type} (${job?.id}): ${err.message}`)
    })

    console.info('[Worker] NotifyWorker avviato')
  }

  static async stop(): Promise<void> {
    if (worker) { await worker.close(); worker = null }
  }
}

// ── Helper: accoda una notifica da qualsiasi servizio ─────

export async function enqueueNotification(
  redisUrl: string,
  job:      NotifyJob,
  options?: { delay?: number; priority?: number }
): Promise<void> {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
  const queue = new Queue<NotifyJob>(QUEUE_NAME, { connection: redis })
  await queue.add(job.type, job, {
    delay:    options?.delay,
    priority: options?.priority ?? 0,
  })
  await redis.quit()
}
