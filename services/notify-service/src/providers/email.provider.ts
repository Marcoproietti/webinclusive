// ─────────────────────────────────────────────────────────
// src/providers/email.provider.ts
// Invio email transazionali via SMTP (nodemailer)
// Template HTML integrati per i tipi di notifica principali
// ─────────────────────────────────────────────────────────

import nodemailer from 'nodemailer'
import { env }    from '../config/env.js'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:   env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })

  return transporter
}

export interface EmailPayload {
  to:      string | string[]
  subject: string
  html:    string
  text?:   string
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!env.SMTP_USER) {
    console.warn('[Email] SMTP non configurato — email non inviata')
    return false
  }
  try {
    await getTransporter().sendMail({
      from:    `WEB.INCLUSIVE <${env.SMTP_FROM}>`,
      to:      Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text,
    })
    return true
  } catch (err: any) {
    console.error('[Email] Errore invio:', err.message)
    return false
  }
}

// ── Template email ────────────────────────────────────────

export function templateWelcome(operatorName: string, tempPassword: string): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1a3a5c;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:1.4rem;">WEB.INCLUSIVE</h1>
        <p style="margin:4px 0 0;opacity:0.8;font-size:0.9rem;">Piattaforma ADI</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <h2>Benvenuto/a, ${operatorName}</h2>
        <p>Il tuo account su WEB.INCLUSIVE è stato creato.</p>
        <p><strong>Credenziali di accesso:</strong></p>
        <div style="background:#f3f4f6;padding:16px;border-radius:6px;font-family:monospace;">
          <p style="margin:0;"><strong>Password temporanea:</strong> ${tempPassword}</p>
        </div>
        <p style="color:#ef4444;font-size:0.9rem;">⚠️ Cambia la password al primo accesso.</p>
        <p>Scarica l'app WEB.INCLUSIVE sul tuo dispositivo per iniziare.</p>
      </div>
    </div>`
}

export function templateClinicalAlert(params: {
  operatorName:  string
  beneficiaryId: string
  alerts:        string[]
  painScale?:    number
  time:          string
}): string {
  const alertList = params.alerts.map((a) => `<li>${a}</li>`).join('')
  const painInfo  = params.painScale
    ? `<p><strong>Scala del dolore:</strong> ${params.painScale}/10${params.painScale >= 7 ? ' ⚠️ URGENTE' : ''}</p>`
    : ''

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#dc2626;color:white;padding:24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:1.2rem;">⚠️ ALERT CLINICO</h1>
        <p style="margin:4px 0 0;opacity:0.9;">${params.time}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;">
        <p><strong>Operatore:</strong> ${params.operatorName}</p>
        <p><strong>Beneficiario:</strong> ${params.beneficiaryId}</p>
        ${painInfo}
        <p><strong>Segnalazioni:</strong></p>
        <ul style="color:#dc2626;">${alertList}</ul>
        <p style="font-size:0.85rem;color:#6b7280;">Verificare immediatamente lo stato del beneficiario.</p>
      </div>
    </div>`
}
