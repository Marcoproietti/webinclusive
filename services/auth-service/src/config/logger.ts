// src/config/logger.ts
import { env } from './env.js'

export const logger = env.NODE_ENV === 'production'
  ? { level: 'info' }
  : {
      level: 'debug',
      transport: {
        target:  'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    }
