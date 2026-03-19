// src/types/fastify.d.ts
// Estende i tipi Fastify con il decorator authenticate

import '@fastify/jwt'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply:   import('fastify').FastifyReply
    ) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub:  string
      role: string
      jti:  string
    }
    user: {
      sub:  string
      role: string
      jti:  string
    }
  }
}
