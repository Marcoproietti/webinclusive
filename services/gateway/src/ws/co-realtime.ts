// ─────────────────────────────────────────────────────────
// src/ws/co-realtime.ts
// WebSocket hub per la Centrale Operativa:
// - Aggiornamenti check-in/out operatori in tempo reale
// - Messaggi CO ↔ operatori
// - Alert clinici urgenti
// Connessioni autenticate via JWT nel handshake
// ─────────────────────────────────────────────────────────

import type { FastifyInstance }     from 'fastify'
import type { WebSocket }           from '@fastify/websocket'
import Redis                         from 'ioredis'
import { env }                       from '../config/env.js'

// ── Tipo messaggio WS ─────────────────────────────────────

type WsEventType =
  | 'CHECKIN'
  | 'CHECKOUT'
  | 'CLINICAL_ALERT'
  | 'MESSAGE_NEW'
  | 'APPOINTMENT_UPDATE'
  | 'OPERATOR_STATUS'
  | 'PING'
  | 'PONG'
  | 'ERROR'
  | 'SUBSCRIBE'

interface WsMessage {
  type:    WsEventType
  payload: Record<string, unknown>
}

// ── Gestione connessioni per ruolo ────────────────────────

// Map: userId → WebSocket connection
const coordinatorConnections = new Map<string, Set<WebSocket>>()
const operatorConnections     = new Map<string, Set<WebSocket>>()

// ── Registra routes WebSocket ─────────────────────────────

export async function registerWsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Subscribe Redis pub/sub per eventi cross-servizio ──
  const subscriber = new Redis(env.REDIS_URL)
  await subscriber.subscribe(
    'wi:checkin',
    'wi:checkout',
    'wi:clinical_alert',
    'wi:message',
    'wi:appointment_update'
  )

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message)
      broadcastToCoordinators({
        type:    channelToEventType(channel),
        payload: data,
      })
    } catch (err) {
      console.error('[WS] Errore parsing messaggio Redis:', err)
    }
  })

  // ── Endpoint WebSocket CO ──────────────────────────────
  // ws://gateway:3000/ws/co
  fastify.get('/ws/co', { websocket: true }, async (socket, req) => {
    let userId: string | null = null
    let userRole: string | null = null

    // Auth: JWT nel primo messaggio o query param ?token=...
    const tokenParam = (req.query as any)?.token
    if (tokenParam) {
      try {
        const decoded = await fastify.jwt.verify<{ sub: string; role: string }>(tokenParam)
        userId   = decoded.sub
        userRole = decoded.role
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Token non valido.' } }))
        socket.close(1008, 'Unauthorized')
        return
      }
    }

    if (!userId || !['admin', 'coordinator'].includes(userRole!)) {
      socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Accesso non autorizzato.' } }))
      socket.close(1008, 'Forbidden')
      return
    }

    // Registra connessione
    if (!coordinatorConnections.has(userId)) {
      coordinatorConnections.set(userId, new Set())
    }
    coordinatorConnections.get(userId)!.add(socket)

    fastify.log.info(`[WS CO] Connesso: ${userId} (${coordinatorConnections.size} coordinatori)`)

    // Messaggio di benvenuto
    send(socket, {
      type:    'PING',
      payload: {
        message:       'Connessione CO stabilita.',
        connectedUsers: coordinatorConnections.size,
        ts:            new Date().toISOString(),
      },
    })

    // ── Handler messaggi in arrivo ────────────────────────
    socket.on('message', (rawMsg: Buffer) => {
      try {
        const msg: WsMessage = JSON.parse(rawMsg.toString())

        switch (msg.type) {
          case 'PING':
            send(socket, { type: 'PONG', payload: { ts: new Date().toISOString() } })
            break

          case 'SUBSCRIBE':
            // Il client si iscrive a eventi specifici (es. solo zona "Roma-Nord")
            // Salvare le preferenze del socket per filtro futuro
            fastify.log.debug(`[WS] Subscribe: ${JSON.stringify(msg.payload)}`)
            break

          case 'MESSAGE_NEW':
            // CO invia messaggio a operatore specifico
            sendToOperator(msg.payload.operatorId as string, {
              type:    'MESSAGE_NEW',
              payload: { ...msg.payload, fromUserId: userId },
            })
            break
        }
      } catch (err) {
        fastify.log.warn('[WS CO] Messaggio non valido:', rawMsg.toString())
      }
    })

    // ── Cleanup alla disconnessione ───────────────────────
    socket.on('close', () => {
      coordinatorConnections.get(userId!)?.delete(socket)
      if (coordinatorConnections.get(userId!)?.size === 0) {
        coordinatorConnections.delete(userId!)
      }
      fastify.log.info(`[WS CO] Disconnesso: ${userId}`)
    })

    socket.on('error', (err) => {
      fastify.log.error('[WS CO] Errore socket:', err.message)
    })
  })

  // ── Endpoint WebSocket Operatori ───────────────────────
  // ws://gateway:3000/ws/operator
  fastify.get('/ws/operator', { websocket: true }, async (socket, req) => {
    let userId: string | null = null
    const tokenParam = (req.query as any)?.token

    if (tokenParam) {
      try {
        const decoded = await fastify.jwt.verify<{ sub: string; role: string }>(tokenParam)
        if (decoded.role !== 'operator') throw new Error('Not operator')
        userId = decoded.sub
      } catch {
        socket.close(1008, 'Unauthorized')
        return
      }
    } else {
      socket.close(1008, 'Token required')
      return
    }

    if (!operatorConnections.has(userId)) operatorConnections.set(userId, new Set())
    operatorConnections.get(userId)!.add(socket)

    send(socket, { type: 'PING', payload: { message: 'Connessione operatore stabilita.' } })

    socket.on('message', (rawMsg: Buffer) => {
      try {
        const msg: WsMessage = JSON.parse(rawMsg.toString())
        if (msg.type === 'PING') send(socket, { type: 'PONG', payload: {} })
      } catch {}
    })

    socket.on('close', () => {
      operatorConnections.get(userId!)?.delete(socket)
      if (operatorConnections.get(userId!)?.size === 0) operatorConnections.delete(userId!)
    })
  })
}

// ── Broadcast helpers ─────────────────────────────────────

function broadcastToCoordinators(msg: WsMessage): void {
  const payload = JSON.stringify(msg)
  for (const connections of coordinatorConnections.values()) {
    for (const socket of connections) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(payload)
      }
    }
  }
}

function sendToOperator(operatorId: string, msg: WsMessage): void {
  const connections = operatorConnections.get(operatorId)
  if (!connections) return
  const payload = JSON.stringify(msg)
  for (const socket of connections) {
    if (socket.readyState === 1) socket.send(payload)
  }
}

function send(socket: WebSocket, msg: WsMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg))
}

function channelToEventType(channel: string): WsEventType {
  const map: Record<string, WsEventType> = {
    'wi:checkin':            'CHECKIN',
    'wi:checkout':           'CHECKOUT',
    'wi:clinical_alert':     'CLINICAL_ALERT',
    'wi:message':            'MESSAGE_NEW',
    'wi:appointment_update': 'APPOINTMENT_UPDATE',
  }
  return map[channel] ?? 'PING'
}

// ── Esporta funzione per pubblicare eventi da altri moduli ─

export function publishEvent(channel: string, data: Record<string, unknown>): void {
  // Usare una connessione Redis separata per publish (non subscriber)
  const publisher = new Redis(env.REDIS_URL)
  publisher.publish(channel, JSON.stringify(data))
    .finally(() => publisher.disconnect())
}
