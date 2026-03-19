// ─────────────────────────────────────────────────────────
// src/routes/clinical.routes.ts
// GET    /api/v1/clinical/:beneficiaryId          — cartella corrente
// PUT    /api/v1/clinical/:beneficiaryId          — aggiorna cartella (versioning)
// GET    /api/v1/clinical/:beneficiaryId/history  — storico versioni
// POST   /api/v1/clinical/:beneficiaryId/notes    — aggiungi nota
// GET    /api/v1/clinical/:beneficiaryId/notes    — lista note
// GET    /api/v1/clinical/:beneficiaryId/notes/:id
// POST   /api/v1/clinical/:beneficiaryId/attachments   — upload
// GET    /api/v1/clinical/:beneficiaryId/attachments   — lista
// GET    /api/v1/clinical/:beneficiaryId/attachments/:id/download
// DELETE /api/v1/clinical/:beneficiaryId/attachments/:id
// GET    /api/v1/clinical/:beneficiaryId/access-log    — GDPR audit
// ─────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify'
import { z }                    from 'zod'
import { prisma, redis, CacheKeys } from '../db/clients.js'
import { enc, dec, encJson, decJson } from '../utils/crypto.js'
import { storageService }       from '../services/storage.service.js'

// ── Schemi ────────────────────────────────────────────────

const clinicalSchema = z.object({
  diagnoses: z.array(z.object({
    icd10:       z.string(),
    description: z.string(),
    date:        z.string().optional(),
  })).default([]),
  allergies: z.array(z.string()).default([]),
  medications: z.array(z.object({
    name:       z.string(),
    dosage:     z.string(),
    frequency:  z.string(),
    start:      z.string().optional(),
    end:        z.string().optional(),
    notes:      z.string().optional(),
  })).default([]),
  functional_assessment: z.record(z.unknown()).default({}),
  barthel_score:         z.number().int().min(0).max(100).optional(),
  cognitive_score:       z.number().int().min(0).max(30).optional(),
  mobility_level:        z.enum(['autonomo','assistito','dipendente','allettato']).optional(),
  anamnesis:             z.string().optional(),
  therapeutic_goals:     z.array(z.string()).default([]),
})

const noteSchema = z.object({
  attendance_id: z.string().uuid(),
  note_text:     z.string().min(1).max(5000),
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
  mood:       z.enum(['sereno','agitato','depresso','confuso','collaborante']).optional(),
})

// ── Helper log accesso (GDPR) ─────────────────────────────

async function logAccess(params: {
  beneficiaryId: string
  userId:        string
  userRole:      string
  action:        string
  entityType:    string
  entityId?:     string
  ipAddress?:    string
}): Promise<void> {
  prisma.accessLog.create({ data: params }).catch(console.error)
}

// ── Plugin routes ─────────────────────────────────────────

export async function clinicalRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', fastify.authenticate)

  // ── GET /:beneficiaryId — Cartella corrente ────────────

  fastify.get<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      const { beneficiaryId } = req.params

      // Cache check
      const cacheKey = CacheKeys.clinicalRecord(beneficiaryId)
      const cached   = await redis.get(cacheKey)

      let record: any
      if (cached) {
        record = JSON.parse(cached)
      } else {
        const raw = await prisma.clinicalRecord.findFirst({
          where:   { beneficiaryId },
          orderBy: { version: 'desc' },
        })
        if (!raw) {
          return reply.code(404).send({ error: 'CLINICAL_RECORD_NOT_FOUND' })
        }
        // Decifra tutti i campi
        record = {
          ...raw,
          diagnoses:            decJson(raw.diagnoses),
          allergies:            decJson(raw.allergies),
          medications:          decJson(raw.medications),
          functionalAssessment: decJson(raw.functionalAssessment),
          anamnesis:            raw.anamnesis ? dec(raw.anamnesis) : null,
          therapeuticGoals:     raw.therapeuticGoals ? decJson(raw.therapeuticGoals) : [],
        }
        // Cache 10 min
        await redis.setex(cacheKey, 600, JSON.stringify(record))
      }

      // Log accesso (GDPR — obbligatorio per dati sanitari)
      await logAccess({
        beneficiaryId,
        userId:     caller.sub,
        userRole:   caller.role,
        action:     'READ',
        entityType: 'clinical_record',
        entityId:   record.id,
        ipAddress:  req.ip,
      })

      return reply.send(record)
    }
  )

  // ── PUT /:beneficiaryId — Aggiorna cartella (versioning) ─

  fastify.put<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      if (!['admin','coordinator','infermiere'].includes(caller.role)) {
        return reply.code(403).send({ error: 'FORBIDDEN' })
      }
      const body = clinicalSchema.parse(req.body)
      const { beneficiaryId } = req.params

      // Recupera versione corrente
      const current = await prisma.clinicalRecord.findFirst({
        where:   { beneficiaryId },
        orderBy: { version: 'desc' },
        select:  { version: true },
      })
      const newVersion = (current?.version ?? 0) + 1

      const record = await prisma.clinicalRecord.create({
        data: {
          beneficiaryId,
          version:              newVersion,
          diagnoses:            encJson(body.diagnoses),
          allergies:            encJson(body.allergies),
          medications:          encJson(body.medications),
          functionalAssessment: encJson(body.functional_assessment),
          barthelScore:         body.barthel_score,
          cognitiveScore:       body.cognitive_score,
          mobilityLevel:        body.mobility_level,
          anamnesis:            body.anamnesis ? enc(body.anamnesis) : null,
          therapeuticGoals:     encJson(body.therapeutic_goals),
          createdBy:            caller.sub,
          updatedBy:            caller.sub,
        },
      })

      // Invalida cache
      await redis.del(CacheKeys.clinicalRecord(beneficiaryId))

      await logAccess({
        beneficiaryId, userId: caller.sub, userRole: caller.role,
        action: newVersion === 1 ? 'CREATE' : 'UPDATE',
        entityType: 'clinical_record', entityId: record.id, ipAddress: req.ip,
      })

      return reply.code(newVersion === 1 ? 201 : 200).send({ ...record, version: newVersion })
    }
  )

  // ── GET /:beneficiaryId/history — Storico versioni ─────

  fastify.get<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId/history',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      if (!['admin','coordinator'].includes(caller.role)) {
        return reply.code(403).send({ error: 'FORBIDDEN' })
      }
      const versions = await prisma.clinicalRecord.findMany({
        where:   { beneficiaryId: req.params.beneficiaryId },
        orderBy: { version: 'desc' },
        select:  { id: true, version: true, createdBy: true, createdAt: true, updatedAt: true },
      })
      return reply.send(versions)
    }
  )

  // ── POST /:beneficiaryId/notes — Aggiungi nota ─────────

  fastify.post<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId/notes',
    async (req, reply) => {
      const caller = req.user as { sub: string }
      const body   = noteSchema.parse(req.body)

      // Verifica attendance_id non già usato
      const existing = await prisma.serviceNote.findUnique({
        where: { attendanceId: body.attendance_id },
      })
      if (existing) return reply.code(409).send({ error: 'NOTE_ALREADY_EXISTS' })

      const note = await prisma.serviceNote.create({
        data: {
          beneficiaryId: req.params.beneficiaryId,
          attendanceId:  body.attendance_id,
          operatorId:    caller.sub,
          noteText:      enc(body.note_text),
          vitalSigns:    body.vital_signs ?? undefined,
          painScale:     body.pain_scale,
          alerts:        body.alerts,
          mood:          body.mood,
        },
      })

      // Invalida cache note
      await redis.del(CacheKeys.notesList(req.params.beneficiaryId))

      await logAccess({
        beneficiaryId: req.params.beneficiaryId,
        userId: caller.sub, userRole: 'operator',
        action: 'CREATE', entityType: 'note', entityId: note.id, ipAddress: req.ip,
      })

      // Alert clinico urgente → pubblica su Redis per notify-service
      if (body.alerts.length > 0 || (body.pain_scale && body.pain_scale >= 7)) {
        const pub = (await import('ioredis')).default
        const publisher = new pub(process.env.REDIS_URL!)
        await publisher.publish('wi:clinical_alert', JSON.stringify({
          noteId:        note.id,
          beneficiaryId: req.params.beneficiaryId,
          operatorId:    caller.sub,
          alerts:        body.alerts,
          painScale:     body.pain_scale,
          ts:            new Date().toISOString(),
        }))
        await publisher.quit()
      }

      return reply.code(201).send({ ...note, note_text: body.note_text })
    }
  )

  // ── GET /:beneficiaryId/notes ──────────────────────────

  fastify.get<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId/notes',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      const q      = req.query as { page?: string; limit?: string }
      const page   = Math.max(1, Number(q.page ?? 1))
      const limit  = Math.min(50, Number(q.limit ?? 20))

      const [notes, total] = await prisma.$transaction([
        prisma.serviceNote.findMany({
          where:   { beneficiaryId: req.params.beneficiaryId },
          skip:    (page-1)*limit, take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.serviceNote.count({ where: { beneficiaryId: req.params.beneficiaryId } }),
      ])

      const decrypted = notes.map((n) => ({
        ...n,
        note_text: dec(n.noteText),
      }))

      await logAccess({
        beneficiaryId: req.params.beneficiaryId,
        userId: caller.sub, userRole: caller.role,
        action: 'READ', entityType: 'note', ipAddress: req.ip,
      })

      return reply.send({
        data:       decrypted,
        pagination: { page, limit, total, pages: Math.ceil(total/limit) },
      })
    }
  )

  // ── POST /:beneficiaryId/attachments — Upload ──────────

  fastify.post<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId/attachments',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      if (!['admin','coordinator','infermiere'].includes(caller.role)) {
        return reply.code(403).send({ error: 'FORBIDDEN' })
      }

      // Leggi il file multipart
      const data = await req.file()
      if (!data) return reply.code(400).send({ error: 'NO_FILE' })

      const buf          = await data.toBuffer()
      const attachType   = (req.query as any).type ?? 'altro'
      const description  = (req.query as any).description ?? ''

      const uploadResult = await storageService.upload({
        beneficiaryId: req.params.beneficiaryId,
        filename:      data.filename,
        mimeType:      data.mimetype,
        buffer:        buf,
      })

      const attachment = await prisma.attachment.create({
        data: {
          beneficiaryId:    req.params.beneficiaryId,
          uploadedBy:       caller.sub,
          attachmentType:   attachType,
          originalFilename: uploadResult.originalFilename,
          storagePath:      uploadResult.storagePath,
          mimeType:         uploadResult.mimeType,
          fileSizeBytes:    uploadResult.fileSizeBytes,
          checksum:         uploadResult.checksum,
          description,
        },
      })

      await logAccess({
        beneficiaryId: req.params.beneficiaryId,
        userId: caller.sub, userRole: caller.role,
        action: 'UPLOAD', entityType: 'attachment', entityId: attachment.id, ipAddress: req.ip,
      })

      return reply.code(201).send({
        id:               attachment.id,
        attachment_type:  attachment.attachmentType,
        mime_type:        attachment.mimeType,
        file_size_bytes:  attachment.fileSizeBytes.toString(),
        checksum:         attachment.checksum,
        uploaded_at:      attachment.uploadedAt,
      })
    }
  )

  // ── GET /:beneficiaryId/attachments ───────────────────

  fastify.get<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId/attachments',
    async (req, reply) => {
      const attachments = await prisma.attachment.findMany({
        where:   { beneficiaryId: req.params.beneficiaryId, isActive: true },
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true, attachmentType: true, mimeType: true,
          fileSizeBytes: true, description: true, uploadedAt: true, checksum: true,
          // Non esporre storagePath cifrato né originalFilename nel listing
        },
      })
      return reply.send(attachments)
    }
  )

  // ── GET /:beneficiaryId/attachments/:id/download ───────

  fastify.get<{ Params: { beneficiaryId: string; id: string } }>(
    '/:beneficiaryId/attachments/:id/download',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      const att    = await prisma.attachment.findFirst({
        where: { id: req.params.id, beneficiaryId: req.params.beneficiaryId, isActive: true },
      })
      if (!att) return reply.code(404).send({ error: 'ATTACHMENT_NOT_FOUND' })

      // Genera URL pre-firmato MinIO (valido 1 ora)
      const url = await storageService.getPresignedUrl(att.storagePath)

      await logAccess({
        beneficiaryId: req.params.beneficiaryId,
        userId: caller.sub, userRole: caller.role,
        action: 'DOWNLOAD', entityType: 'attachment', entityId: att.id, ipAddress: req.ip,
      })

      // Decifra nome file per il download
      const filename = dec(att.originalFilename)
      return reply.send({ download_url: url, filename, expires_in: 3600 })
    }
  )

  // ── DELETE /:beneficiaryId/attachments/:id ─────────────

  fastify.delete<{ Params: { beneficiaryId: string; id: string } }>(
    '/:beneficiaryId/attachments/:id',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      if (!['admin','coordinator'].includes(caller.role)) {
        return reply.code(403).send({ error: 'FORBIDDEN' })
      }
      const att = await prisma.attachment.findFirst({
        where: { id: req.params.id, beneficiaryId: req.params.beneficiaryId },
      })
      if (!att) return reply.code(404).send({ error: 'ATTACHMENT_NOT_FOUND' })

      // Soft delete — non rimuovere fisicamente da MinIO per retention normativa
      await prisma.attachment.update({
        where: { id: req.params.id },
        data:  { isActive: false },
      })

      await logAccess({
        beneficiaryId: req.params.beneficiaryId,
        userId: caller.sub, userRole: caller.role,
        action: 'DELETE', entityType: 'attachment', entityId: att.id, ipAddress: req.ip,
      })

      return reply.send({ message: 'Allegato rimosso.' })
    }
  )

  // ── GET /:beneficiaryId/access-log — GDPR audit ────────

  fastify.get<{ Params: { beneficiaryId: string } }>(
    '/:beneficiaryId/access-log',
    async (req, reply) => {
      const caller = req.user as { sub: string; role: string }
      if (!['admin','auditor'].includes(caller.role)) {
        return reply.code(403).send({ error: 'FORBIDDEN' })
      }
      const q     = req.query as { page?: string; limit?: string }
      const page  = Math.max(1, Number(q.page ?? 1))
      const limit = Math.min(100, Number(q.limit ?? 50))

      const [logs, total] = await prisma.$transaction([
        prisma.accessLog.findMany({
          where:   { beneficiaryId: req.params.beneficiaryId },
          skip:    (page-1)*limit, take: limit,
          orderBy: { accessedAt: 'desc' },
        }),
        prisma.accessLog.count({ where: { beneficiaryId: req.params.beneficiaryId } }),
      ])

      return reply.send({
        data:       logs,
        pagination: { page, limit, total, pages: Math.ceil(total/limit) },
      })
    }
  )
}
