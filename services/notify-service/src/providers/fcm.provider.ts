// ─────────────────────────────────────────────────────────
// src/providers/fcm.provider.ts
// Firebase Cloud Messaging — push Android + web
// ─────────────────────────────────────────────────────────

import * as admin from 'firebase-admin'
import { env }    from '../config/env.js'

let fcmApp: admin.app.App | null = null

function getApp(): admin.app.App {
  if (fcmApp) return fcmApp

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    console.warn('[FCM] Credenziali Firebase non configurate — push Android disabilitati')
    throw new Error('FCM_NOT_CONFIGURED')
  }

  fcmApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      // La chiave privata nel .env ha \n letterali — li convertiamo
      privateKey:  env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  })

  return fcmApp
}

export interface PushPayload {
  token:   string       // FCM device token
  title:   string
  body:    string
  data?:   Record<string, string>
  badge?:  number
}

export interface PushResult {
  success:   boolean
  messageId?: string
  error?:    string
}

export async function sendFcm(payload: PushPayload): Promise<PushResult> {
  try {
    const app       = getApp()
    const messaging = app.messaging()

    const messageId = await messaging.send({
      token:        payload.token,
      notification: {
        title: payload.title,
        body:  payload.body,
      },
      data:         payload.data,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    })

    return { success: true, messageId }
  } catch (err: any) {
    console.error('[FCM] Errore invio push:', err.message)

    // Token non valido o scaduto → segnala per rimozione
    if (err.code === 'messaging/invalid-registration-token' ||
        err.code === 'messaging/registration-token-not-registered') {
      return { success: false, error: 'TOKEN_INVALID' }
    }

    return { success: false, error: err.message }
  }
}

// ── Invio multiplo (multicast, max 500 token) ─────────────

export async function sendFcmMulticast(params: {
  tokens:  string[]
  title:   string
  body:    string
  data?:   Record<string, string>
}): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
  try {
    const app       = getApp()
    const messaging = app.messaging()

    const response = await messaging.sendEachForMulticast({
      tokens:       params.tokens,
      notification: { title: params.title, body: params.body },
      data:         params.data,
      android:      { priority: 'high' },
    })

    const invalidTokens: string[] = []
    response.responses.forEach((r, i) => {
      if (!r.success && (
        r.error?.code === 'messaging/invalid-registration-token' ||
        r.error?.code === 'messaging/registration-token-not-registered'
      )) {
        invalidTokens.push(params.tokens[i])
      }
    })

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    }
  } catch {
    return { successCount: 0, failureCount: params.tokens.length, invalidTokens: [] }
  }
}
