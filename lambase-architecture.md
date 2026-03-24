# LamBase — System Architecture
> Internal team document — v1.0

---

## What Is LamBase

LamBase is a fully self-hosted, open source backend platform.
A single compiled binary that gives any web app, mobile app, or service a complete backend — database, auth, realtime, file storage, and edge functions — with zero cloud dependency and zero coding required to set up.

```
Download binary → Run → Open browser → Full backend running.
```

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│                   LamBase Binary                      │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Fiber HTTP │  │    Auth     │  │    Deno     │  │
│  │   Server   │  │   Engine    │  │   Runtime   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  WebSocket  │  │   Storage   │  │  React TSX  │  │
│  │  Realtime  │  │    Layer    │  │  Dashboard  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                      │
│              ┌───────────────────┐                   │
│              │  libSQL Database  │                   │
│              └───────────────────┘                   │
└──────────────────────────────────────────────────────┘
```

---

## Layer Breakdown

### Layer 1 — HTTP Server (Go + Fiber)
- Handles all inbound HTTP and WebSocket connections
- Routes requests to the correct internal module
- Applies JWT middleware on protected routes
- Serves the embedded React SPA on all non-API routes
- CORS configured out of the box

### Layer 2 — Database (libSQL)
- SQLite-compatible, edge-native, zero-config
- All user tables stored in a single `.db` file on disk
- Internal system tables prefixed with `_` (e.g. `_users`, `_sessions`)
- Full SQL support: joins, indexes, transactions, JSON columns
- Migrations run automatically on startup

### Layer 3 — Schema Engine
- User defines a table in the dashboard UI
- Schema engine creates the table in libSQL
- Immediately and dynamically registers 5 REST routes for that table
- Emits a WebSocket signal to notify connected clients of schema change
- No restart required — routes are live instantly

### Layer 4 — Auth Engine
- Email + password signup/signin with bcrypt hashing
- JWT issued on signin, verified via middleware on every protected request
- OAuth2 support: Google, GitHub (provider config via dashboard)
- Magic link email auth (SMTP config required)
- Role-based access: `admin`, `user`, custom roles
- Row-level security policies: per-table rules tied to user role/id

### Layer 5 — Realtime Engine
- WebSocket server at `/api/v1/realtime`
- In-memory hub using Go channels — one goroutine per client connection
- Clients subscribe to any table by name
- On any INSERT / UPDATE / DELETE, server broadcasts the change record to all subscribers of that table
- Payload includes: table name, event type, full new record

### Layer 6 — Edge Functions (Deno Runtime)
- User writes TypeScript functions in the browser using Monaco editor
- Functions follow the WinterCG / Cloudflare Workers interface (standard `Request → Response`)
- LamBase spawns a Deno subprocess to execute the function
- A `ctx` object is injected: `ctx.db`, `ctx.auth`, `ctx.env`, `ctx.storage`
- Any AI tool (Copilot, Cursor, Claude) can generate these functions without custom docs — the interface is industry standard
- Timeout: 10 seconds. Temp files cleaned up post-execution.

### Layer 7 — File Storage
- Bucket-based file storage on local disk
- S3-compatible API for drop-in replacement
- Metadata stored in `_storage` internal table
- Dashboard UI for bucket management, upload, and deletion

### Layer 8 — Dashboard (React TSX SPA)
- Compiled by Vite, embedded into the Go binary via `go:embed`
- Served directly from the binary — no separate web server needed
- Connects to the Go backend via the `lambase.ts` API client
- Two-color design system: black + electric lime

---

## Data Flow — Table Query

```
Client App
    │
    │  GET /api/v1/db/orders?status=pending
    ▼
Fiber HTTP Server
    │
    │  JWT middleware validates token
    ▼
Schema Engine (dynamic route handler)
    │
    │  Builds SQL: SELECT * FROM orders WHERE status = 'pending'
    ▼
libSQL Client
    │
    │  Executes query, returns rows
    ▼
JSON Response → Client App
```

---

## Data Flow — Realtime Event

```
Client App A writes:  POST /api/v1/db/orders  { item: "laptop" }
                              │
                              ▼
                    Schema Engine inserts row
                              │
                              ▼
                    Realtime Hub receives CDC event
                              │
                   ┌──────────┴──────────┐
                   ▼                     ▼
           Client App B            Client App C
      (subscribed to orders)   (subscribed to orders)
      receives WS message       receives WS message
```

---

## Data Flow — Edge Function

```
HTTP Request → POST /api/v1/functions/charge-user/invoke
                        │
                        ▼
              Load function code from _functions table
                        │
                        ▼
              Write code to /tmp/fn_xyz.ts
              Inject LAM_CTX env variable
                        │
                        ▼
              Spawn: deno run /tmp/fn_xyz.ts
                        │
                        ▼
              Capture stdout → return as HTTP response
              Cleanup /tmp/fn_xyz.ts
```

---

## Internal Database Schema

```sql
-- System users table
_users        (id, email, password_hash, role, metadata, created_at)

-- Active sessions
_sessions     (id, user_id, token, expires_at, created_at)

-- Edge function code store
_functions    (id, name, code, created_at)

-- File storage metadata
_storage      (id, bucket, filename, path, size, mime_type, created_at)
```

---

## API Surface

```
Database
  GET    /api/v1/db/:table              list rows
  GET    /api/v1/db/:table/:id          get row
  POST   /api/v1/db/:table              insert row
  PATCH  /api/v1/db/:table/:id          update row
  DELETE /api/v1/db/:table/:id          delete row

Schema
  GET    /api/v1/schema/tables          list all tables
  POST   /api/v1/schema/tables          create table
  DELETE /api/v1/schema/tables/:name    drop table

Auth
  POST   /api/v1/auth/signup            register user
  POST   /api/v1/auth/signin            login, returns JWT
  POST   /api/v1/auth/signout           invalidate session
  GET    /api/v1/auth/user              current user from JWT

Edge Functions
  GET    /api/v1/functions              list functions
  POST   /api/v1/functions/:name/deploy deploy/update function
  POST   /api/v1/functions/:name/invoke invoke function

Storage
  GET    /api/v1/storage/:bucket        list files in bucket
  POST   /api/v1/storage/:bucket        upload file
  DELETE /api/v1/storage/:bucket/:id    delete file

Realtime
  WS     /api/v1/realtime               WebSocket connection
```

---

## Technology Decisions

| Component | Technology | Reason |
|---|---|---|
| Backend language | Go | Single binary compilation, goroutines for realtime, cross-platform |
| HTTP framework | Fiber | Fastest Go HTTP framework, Express-like API |
| Database | libSQL (SQLite) | Zero-config, file-based, edge-native, full SQL |
| Auth tokens | JWT (golang-jwt) | Stateless, industry standard |
| Password hashing | bcrypt | Industry standard, built into Go stdlib |
| Edge functions | Deno subprocess | WinterCG compliant, TypeScript native, embeddable |
| Frontend | React + TypeScript + Vite | Fast build, TSX, type safety |
| State management | Zustand | Minimal, fast, no boilerplate |
| Data fetching | TanStack Query | Caching, background sync, loading states |
| Frontend embedding | go:embed | Zero external dependency, single binary |

---

## Deployment

```bash
# Any Linux / Mac / Windows machine
./lambase --port 3000 --db ./lambase.db --secret your-jwt-secret

# Environment variables alternative
PORT=3000 DB_PATH=./lambase.db JWT_SECRET=xxx ./lambase
```

No Docker. No Node. No Python. No runtime dependencies.
The binary is the entire product.
