// ─────────────────────────────────────────────────────────
// src/services/storage.service.ts
// Upload/download allegati su MinIO con cifratura AES-256-GCM
// ─────────────────────────────────────────────────────────

import { randomUUID }                from 'crypto'
import { Readable }                  from 'stream'
import { minioClient }               from '../db/clients.js'
import { enc, dec, sha256 }          from '../utils/crypto.js'
import { env }                       from '../config/env.js'

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
  'application/dicom', 'text/plain',
])

export interface UploadResult {
  storagePath:      string  // path cifrato salvato in DB
  originalFilename: string  // filename cifrato salvato in DB
  checksum:         string  // SHA-256 del file originale
  fileSizeBytes:    number
  mimeType:         string
}

export class StorageService {

  // ── Upload allegato cifrato ───────────────────────────

  async upload(params: {
    beneficiaryId: string
    filename:      string
    mimeType:      string
    buffer:        Buffer
  }): Promise<UploadResult> {

    if (!ALLOWED_MIME.has(params.mimeType)) {
      throw Object.assign(new Error('UNSUPPORTED_MIME_TYPE'), { mime: params.mimeType })
    }

    if (params.buffer.length > env.MAX_ATTACHMENT_SIZE) {
      throw new Error('FILE_TOO_LARGE')
    }

    // 1. Calcola checksum del file originale
    const checksum = sha256(params.buffer)

    // 2. Cifra il contenuto del file (AES-256-GCM streaming)
    // Per semplicità cifriamo il buffer intero; in produzione
    // usare streams per file molto grandi
    const encryptedBuffer = this._encryptBuffer(params.buffer)

    // 3. Costruisce path oggetto: beneficiaryId/year/month/uuid.enc
    const now     = new Date()
    const objPath = [
      params.beneficiaryId,
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.enc`,
    ].join('/')

    // 4. Upload su MinIO
    const stream = Readable.from(encryptedBuffer)
    await minioClient.putObject(
      env.MINIO_BUCKET,
      objPath,
      stream,
      encryptedBuffer.length,
      {
        'Content-Type':       'application/octet-stream',
        'x-amz-meta-mime':    params.mimeType,
        'x-amz-meta-checksum':checksum,
      }
    )

    return {
      storagePath:      enc(objPath),          // cifra il path prima del salvataggio
      originalFilename: enc(params.filename),  // cifra il nome
      checksum,
      fileSizeBytes:    params.buffer.length,
      mimeType:         params.mimeType,
    }
  }

  // ── Genera URL firmato (TTL 1 ora) ───────────────────

  async getPresignedUrl(encryptedPath: string, expirySeconds = 3600): Promise<string> {
    const objPath = dec(encryptedPath)
    return minioClient.presignedGetObject(env.MINIO_BUCKET, objPath, expirySeconds)
  }

  // ── Download + decifra buffer ────────────────────────

  async download(encryptedPath: string): Promise<Buffer> {
    const objPath = dec(encryptedPath)
    const stream  = await minioClient.getObject(env.MINIO_BUCKET, objPath)

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const encryptedBuffer = Buffer.concat(chunks)
    return this._decryptBuffer(encryptedBuffer)
  }

  // ── Elimina allegato ─────────────────────────────────

  async delete(encryptedPath: string): Promise<void> {
    const objPath = dec(encryptedPath)
    await minioClient.removeObject(env.MINIO_BUCKET, objPath)
  }

  // ── Cifratura/decifratura buffer raw ─────────────────

  private _encryptBuffer(buf: Buffer): Buffer {
    const { createCipheriv, randomBytes } = await import('crypto').then(m => m)
    // Nota: import() in metodo sync non è ideale, usiamo sync
    const crypto   = require('crypto')
    const key      = Buffer.from(env.ENCRYPTION_KEY, 'hex')
    const iv       = crypto.randomBytes(12)
    const cipher   = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    const encrypted = Buffer.concat([cipher.update(buf), cipher.final()])
    const tag       = cipher.getAuthTag()
    // Formato: [4 byte lunghezza IV][IV][4 byte lunghezza TAG][TAG][dati cifrati]
    const ivLen  = Buffer.alloc(4); ivLen.writeUInt32BE(iv.length)
    const tagLen = Buffer.alloc(4); tagLen.writeUInt32BE(tag.length)
    return Buffer.concat([ivLen, iv, tagLen, tag, encrypted])
  }

  private _decryptBuffer(buf: Buffer): Buffer {
    const crypto    = require('crypto')
    const key       = Buffer.from(env.ENCRYPTION_KEY, 'hex')
    let offset      = 0
    const ivLen     = buf.readUInt32BE(offset); offset += 4
    const iv        = buf.slice(offset, offset + ivLen); offset += ivLen
    const tagLen    = buf.readUInt32BE(offset); offset += 4
    const tag       = buf.slice(offset, offset + tagLen); offset += tagLen
    const encrypted = buf.slice(offset)
    const decipher  = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  }
}

export const storageService = new StorageService()
