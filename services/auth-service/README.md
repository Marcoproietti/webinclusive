# auth-service

Microservizio di autenticazione per **WEB.INCLUSIVE**.

## Responsabilità

- Login con email/password (bcrypt cost 12)
- Dual-token: JWT access (15m) + refresh opaco HttpOnly cookie (7gg)
- Rotazione automatica refresh token ad ogni uso
- MFA TOTP (Google Authenticator, RFC 6238)
- Gestione utenti (admin, coordinator, operator, caregiver, auditor)
- Gestione profilo operatore ADI (qualifica, zona, device secret)
- Policy password OWASP + storico ultimi 5 hash
- Cifratura AES-256-GCM dei campi PII (nome, CF, data nascita)
- Audit log append-only su ogni azione sensibile

## Stack

| Tool | Versione | Scopo |
|------|----------|-------|
| Node.js | 20 LTS | Runtime |
| Fastify | 4.x | HTTP framework |
| Prisma | 5.x | ORM + migrations |
| PostgreSQL | 15 | Storage principale |
| Redis | 7 | Refresh token cache + rate limit |
| Zod | 3.x | Validazione schema input |
| bcrypt | 5.x | Hash password |
| otplib | 12.x | TOTP MFA |

## Avvio rapido (sviluppo)

```bash
# 1. Dipendenze
npm install

# 2. Configura environment
cp .env.example .env
# → modifica .env con i tuoi valori

# 3. Genera Prisma client
npx prisma generate

# 4. Esegui migrations
npx prisma migrate dev --name init

# 5. Seed dati di test
npx tsx prisma/seed.ts

# 6. Avvia in watch mode
npm run dev
```

## Variabili d'ambiente richieste

| Variabile | Descrizione | Come generare |
|-----------|-------------|---------------|
| `JWT_ACCESS_SECRET` | Chiave firma JWT | `openssl rand -hex 64` |
| `COOKIE_SECRET` | Chiave firma cookie | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Chiave AES-256 PII | `openssl rand -hex 32` |
| `DATABASE_URL` | Connessione PostgreSQL | — |
| `REDIS_URL` | Connessione Redis | — |

## API Endpoints

```
POST /api/v1/auth/login          → login credenziali
POST /api/v1/auth/refresh        → refresh access token
POST /api/v1/auth/logout         → logout (revoca token)
POST /api/v1/auth/mfa/setup      → setup TOTP [JWT]
POST /api/v1/auth/mfa/confirm    → conferma setup TOTP [JWT]
POST /api/v1/auth/mfa/verify     → verifica TOTP (step 2 login MFA)

GET    /api/v1/users             → lista utenti [admin, coordinator]
GET    /api/v1/users/:id         → dettaglio utente [JWT]
POST   /api/v1/users             → crea utente [admin]
PATCH  /api/v1/users/:id         → aggiorna utente [admin]
PATCH  /api/v1/users/:id/password → cambio password [JWT]
DELETE /api/v1/users/:id         → disattiva utente [admin]

GET    /api/v1/operators         → lista operatori [admin, coord]
GET    /api/v1/operators/:id     → dettaglio operatore [JWT]
POST   /api/v1/operators         → crea operatore [admin, coord]
PATCH  /api/v1/operators/:id     → aggiorna operatore [admin, coord]
POST   /api/v1/operators/:id/device → registra device token [JWT]

GET /health                      → liveness check
GET /health/ready                → readiness check (DB + Redis)
```

## Sicurezza — note implementative

### Cifratura PII
I campi sensibili (nome, cognome, codice fiscale) sono cifrati con **AES-256-GCM**
prima della persistenza in PostgreSQL. Ogni campo ha IV casuale → lo stesso valore
produrre ciphertext diversi. Il GCM auth tag garantisce integrità.

### Refresh Token
Il token grezzo non è mai salvato — solo il suo **SHA-256** è in DB.
Salvato anche in Redis per lookup O(1) con TTL automatico.

### Brute Force
10 tentativi falliti per IP → lockout 15 minuti (Redis counter).
Verifica bcrypt sempre eseguita anche per utenti inesistenti (timing-safe).

### Audit Log
Tabella `audit_logs` protetta da RULE PostgreSQL che impedisce UPDATE/DELETE.
Scrittura fire-and-forget per non impattare latenza risposta.

## Test

```bash
npm test            # run una volta
npm run test:watch  # watch mode
```

I test di integrazione richiedono PostgreSQL e Redis attivi
(oppure usa `docker-compose up -d postgres redis`).
