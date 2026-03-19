// ─────────────────────────────────────────────────────────
// src/routes/attendance.routes.ts
// POST /api/v1/attendance/checkin
// POST /api/v1/attendance/:id/checkout
// POST /api/v1/attendance/sync
// GET  /api/v1/attendance
// GET  /api/v1/attendance/:id
// GET  /api/v1/attendance/report
// POST /api/v1/attendance/:id/note
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { format }               from 'date-fns'
import { prisma }               from '../db/clients.js'
import { attendanceService }    from '../services/attendance.service.js'
import { encryptField, decryptField } from '../utils/crypto.js'

// ── Schemi ────────────────────────────────────────────────

const checkInSchema = z.object({
  appointment_id:   z.string().uuid(),
  lat:              z.number().min(-90).max(90),
  lng:              z.number().min(-180).max(180),
  device_signature: z.string().length(64),   // HMAC-SHA256 = 32 byte = 64 hex chars
  client_timestamp: z.string().datetime(),
  device_id:        z.string().min(1),
})

const checkOutSchema = z.object({
  lat:              z.number().min(-90).max(90),
  lng:              z.number().min(-180).max(180),
  device_signature: z.string().length(64),
  client_timestamp: z.string().datetime(),
  device_id:        z.string().min(1),
})

const syncSchema = z.object({
  records: z.array(z.object({
    type:             z.enum(['checkin', 'checkout']),
    appointment_id:   z.string().uuid().optional(),
    attendance_id:    z.string().uuid().optional(),
    lat:              z.number().min(-90).max(90),
    lng:              z.number().min(-180).max(180),
    device_signature: z.string().length(64),
    client_timestamp: z.string().datetime(),
    device_id:        z.string().min(1),
  })).min(1).max(50),
})

const noteSchema = z.object({
  note_text:   z.string().min(1).max(5000),
  vital_signs: z.object({
    bp_systolic:      z.number().int().optional(),
    bp_diastolic:     z.number().int().optional(),
    heart_rate:       z.number().int().optional(),
    temperature:      z.number().optional(),
    oxygen_sat:       z.number().int().min(0).max(100).optional(),
    respiratory_rate: z.number().int().optional(),
  }).optional(),
  pain_scale: z.number().int().min(0).max(10).optional(),
  alerts:     z.array(z.string()).default([]),
})

// ── Routes ────────────────────────────────────────────────

export async function attendanceRoutes(fastify: FastifyInstance) {

  fastify.addHook('onRequest', fastify.authenticate)

  // ── POST /checkin ──────────────────────────────────────

  fastify.post('/checkin', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    const body   = checkInSchema.parse(req.body)

    // Solo operatori possono fare check-in
    if (caller.role !== 'operator') {
      return reply.code(403).send({ error: 'FORBIDDEN', message: 'Solo gli operatori possono fare check-in.' })
    }

    const result = await attendanceService.checkIn({
      appointmentId:   body.appointment_id,
      operatorId:      caller.sub,
      lat:             body.lat,
      lng:             body.lng,
      deviceSignature: body.device_signature,
      clientTimestamp: body.client_timestamp,
      deviceId:        body.device_id,
    })

    return reply.code(201).send({
      attendance_id:   result.attendanceId,
      check_in_at:     result.checkInAt.toISOString(),
      is_verified:     result.isVerified,
      geofence_ok:     result.geofenceOk,
      distance_meters: result.distanceMeters,
      message:         result.isVerified
        ? 'Presenza registrata e verificata.'
        : 'Presenza registrata (verifica firma fallita — segnalare all\'ufficio).',
    })
  })

  // ── POST /:id/checkout ─────────────────────────────────

  fastify.post<{ Params: { id: string } }>('/:id/checkout', async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = checkOutSchema.parse(req.body)

    const result = await attendanceService.checkOut({
      attendanceId:    req.params.id,
      operatorId:      caller.sub,
      lat:             body.lat,
      lng:             body.lng,
      deviceSignature: body.device_signature,
      clientTimestamp: body.client_timestamp,
      deviceId:        body.device_id,
    })

    return reply.send({
      attendance_id: result.attendanceId,
      check_out_at:  result.checkOutAt.toISOString(),
      duration_min:  result.durationMin,
      is_verified:   result.isVerified,
      message:       `Uscita registrata. Durata: ${result.durationMin} minuti.`,
    })
  })

  // ── POST /sync — Sync batch offline ───────────────────

  fastify.post('/sync', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    const body   = syncSchema.parse(req.body)

    if (caller.role !== 'operator') {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    const result = await attendanceService.syncBatch(
      caller.sub,
      body.records.map((r) => ({
        type:            r.type,
        appointmentId:   r.appointment_id,
        attendanceId:    r.attendance_id,
        lat:             r.lat,
        lng:             r.lng,
        deviceSignature: r.device_signature,
        clientTimestamp: r.client_timestamp,
        deviceId:        r.device_id,
      }))
    )

    return reply.send({
      processed: result.processed,
      errors:    result.errors,
      message:   `Sincronizzati ${result.processed}/${body.records.length} record.`,
    })
  })

  // ── GET / — Lista presenze ─────────────────────────────

  fastify.get('/', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    const q      = req.query as {
      operator_id?: string; status?: string
      from?: string; to?: string
      page?: string; limit?: string
    }

    const page  = Math.max(1, Number(q.page ?? 1))
    const limit = Math.min(100, Number(q.limit ?? 20))
    const where: any = {}

    // Operatori vedono solo le proprie presenze
    if (caller.role === 'operator') {
      where.operatorId = caller.sub
    } else if (q.operator_id) {
      where.operatorId = q.operator_id
    }

    if (q.status) where.status = q.status
    if (q.from || q.to) {
      where.checkInAt = {
        ...(q.from && { gte: new Date(q.from) }),
        ...(q.to   && { lte: new Date(q.to) }),
      }
    }

    const [records, total] = await prisma.$transaction([
      prisma.attendanceRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { note: true },
        orderBy: { checkInAt: 'desc' },
      }),
      prisma.attendanceRecord.count({ where }),
    ])

    return reply.send({
      data:       records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  })

  // ── GET /:id ───────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    const record = await prisma.attendanceRecord.findUnique({
      where:   { id: req.params.id },
      include: { note: true },
    })
    if (!record) return reply.code(404).send({ error: 'ATTENDANCE_NOT_FOUND' })

    if (caller.role === 'operator' && record.operatorId !== caller.sub) {
      return reply.code(403).send({ error: 'FORBIDDEN' })
    }

    // Decifra nota se presente
    const out: any = { ...record }
    if (record.note) {
      out.note = { ...record.note, note_text: decryptField(record.note.noteText) }
    }
    return reply.send(out)
  })

  // ── POST /:id/note — Nota post-visita ──────────────────

  fastify.post<{ Params: { id: string } }>('/:id/note', async (req, reply) => {
    const caller = req.user as { sub: string }
    const body   = noteSchema.parse(req.body)

    const record = await prisma.attendanceRecord.findUnique({
      where: { id: req.params.id },
    })
    if (!record) return reply.code(404).send({ error: 'ATTENDANCE_NOT_FOUND' })
    if (record.operatorId !== caller.sub) return reply.code(403).send({ error: 'FORBIDDEN' })

    // Verifica checkout avvenuto
    if (record.status !== 'checked_out') {
      return reply.code(400).send({
        error:   'CHECKOUT_REQUIRED',
        message: 'La nota può essere aggiunta solo dopo il checkout.',
      })
    }

    // Verifica non esista già una nota
    const existingNote = await prisma.serviceNote.findUnique({
      where: { attendanceId: req.params.id },
    })
    if (existingNote) {
      return reply.code(409).send({ error: 'NOTE_ALREADY_EXISTS' })
    }

    const note = await prisma.serviceNote.create({
      data: {
        attendanceId: req.params.id,
        operatorId:   caller.sub,
        noteText:     encryptField(body.note_text),
        vitalSigns:   body.vital_signs ?? undefined,
        painScale:    body.pain_scale,
        alerts:       body.alerts,
      },
    })

    // Aggiorna flag hasNote
    await prisma.attendanceRecord.update({
      where: { id: req.params.id },
      data:  { hasNote: true },
    })

    // Se alert o pain_scale alto → notifica coordinatore
    if (body.alerts.length > 0 || (body.pain_scale && body.pain_scale >= 7)) {
      this._emitClinicalAlert({
        attendanceId:  req.params.id,
        appointmentId: record.appointmentId,
        operatorId:    caller.sub,
        alerts:        body.alerts,
        painScale:     body.pain_scale,
      }).catch(console.error)
    }

    return reply.code(201).send({
      ...note,
      note_text: body.note_text, // restituisce in chiaro
    })
  })

  // ── GET /report — Export presenze ─────────────────────

  fastify.get('/report', async (req, reply) => {
    const caller = req.user as { sub: string; role: string }
    const q = z.object({
      from:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      operator_id: z.string().uuid().optional(),
      format:      z.enum(['json', 'csv']).default('json'),
    }).parse(req.query)

    // Solo coordinator/admin possono esportare tutti; operatori solo i propri
    const operatorId = caller.role === 'operator' ? caller.sub : q.operator_id

    const records = await attendanceService.getReport({
      from:        new Date(q.from),
      to:          new Date(q.to),
      operatorId,
      format:      q.format,
    })

    if (q.format === 'csv') {
      // Costruisce CSV manualmente (no dipendenza esterna in questo contesto)
      const header  = 'attendance_id,operator_id,appointment_id,check_in_at,check_out_at,duration_min,is_verified,geofence_ok'
      const rows    = records.map((r) => [
        r.id, r.operatorId, r.appointmentId,
        r.checkInAt.toISOString(),
        r.checkOutAt?.toISOString() ?? '',
        r.durationMin ?? '',
        r.isVerified,
        r.geofenceOk,
      ].join(','))

      reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="presenze_${q.from}_${q.to}.csv"`)
      return reply.send([header, ...rows].join('\n'))
    }

    return reply.send({ data: records, count: records.length })
  })

  // ── Private: emetti alert clinico ─────────────────────

  async _emitClinicalAlert(params: {
    attendanceId:  string
    appointmentId: string
    operatorId:    string
    alerts:        string[]
    painScale?:    number
  }) {
    // Pubblica su coda notifiche per notify-service
    // Il notify-service invierà push al coordinatore
    console.warn('[Clinical Alert]', params)
    // TODO: Queue.add('clinical-alert', params)
  }
}
