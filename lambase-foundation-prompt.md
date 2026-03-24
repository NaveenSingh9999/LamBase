# LamBase — Foundation Scaffold Prompt
> Paste this entire prompt into Cursor / Windsurf / Copilot Chat

---

## Project Overview
Build the foundation of **LamBase** — a fully self-hosted, open source backend platform.
Single Go binary that serves a React TSX dashboard. No cloud. No Docker. One file runs everything.

---

## BACKEND — Go

### Setup
- Initialize a Go module: `github.com/lambase/lambase`
- Go version: 1.22+
- Use `go:embed` to bundle the compiled frontend `dist/` folder into the binary

### Dependencies (go.mod)
```
github.com/gofiber/fiber/v2           → HTTP server (fast, Express-like)
github.com/gofiber/websocket/v2       → WebSocket realtime
github.com/tursodatabase/libsql-client-go → Database (libSQL / SQLite)
github.com/golang-jwt/jwt/v5          → JWT auth
golang.org/x/crypto                   → Password hashing (bcrypt)
github.com/google/uuid                → UUID generation
```

### Folder Structure
```
lambase/
├── main.go                   → Entry point, boots all services
├── core/
│   ├── server.go             → Fiber HTTP server setup
│   ├── schema.go             → Table creation + auto API generation
│   ├── auth.go               → JWT, sessions, OAuth2 foundations
│   ├── realtime.go           → WebSocket hub + CDC change events
│   ├── storage.go            → Local file storage, bucket management
│   └── functions.go          → Edge function runner (Deno subprocess)
├── db/
│   └── client.go             → libSQL connection + query helpers
├── api/
│   ├── tables.go             → CRUD routes auto-generated per table
│   ├── auth.go               → /auth/signup /auth/signin /auth/signout
│   ├── storage.go            → /storage/:bucket upload/download routes
│   └── functions.go          → /functions/:name invoke route
├── embed.go                  → go:embed dist/* frontend SPA
└── config/
    └── config.go             → Port, secret keys, DB path from env/flags
```

### main.go — What It Must Do
```go
// 1. Load config (port, db path, jwt secret) from flags or .env
// 2. Connect to libSQL database
// 3. Run auto-migrations (create lambase internal tables: _users, _sessions, _storage, _functions)
// 4. Start Fiber HTTP server
// 5. Register all API route groups: /api/v1/tables, /api/v1/auth, /api/v1/storage, /api/v1/functions, /api/v1/realtime (ws)
// 6. Serve embedded TSX frontend SPA on all non-API routes
// 7. Print startup banner: "LamBase running on http://localhost:{port}"
```

### Internal Tables (auto-created on first run)
```sql
CREATE TABLE IF NOT EXISTS _users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'user',
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS _sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  token TEXT UNIQUE,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS _functions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS _storage (
  id TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Auto API Generation (schema.go)
When a user creates a table via the dashboard, the backend must:
1. Run `CREATE TABLE` in libSQL
2. Dynamically register these Fiber routes:
```
GET    /api/v1/db/:table         → select all (with filter, sort, limit queryparams)
POST   /api/v1/db/:table         → insert row
PATCH  /api/v1/db/:table/:id     → update row
DELETE /api/v1/db/:table/:id     → delete row
GET    /api/v1/db/:table/:id     → select single row
```
3. Emit a WebSocket event to all subscribers of that table

### Realtime (realtime.go)
```
WebSocket endpoint: ws://localhost:{port}/api/v1/realtime

Client subscribes: { "event": "subscribe", "table": "orders" }
Server emits on any INSERT/UPDATE/DELETE:
{
  "table": "orders",
  "event": "INSERT",
  "record": { ...new row data... }
}
```
Use a simple in-memory hub with Go channels. One goroutine per connection.

### Auth Routes
```
POST /api/v1/auth/signup    → email + password → create _users row → return JWT
POST /api/v1/auth/signin    → email + password → verify → return JWT
POST /api/v1/auth/signout   → invalidate session token
GET  /api/v1/auth/user      → return current user from JWT header
```

### Edge Functions (functions.go)
```
POST /api/v1/functions/:name/deploy  → save TS code to _functions table
POST /api/v1/functions/:name/invoke  → run via Deno subprocess

Deno invocation:
  - Write function code to temp .ts file
  - Inject ctx object as JSON via env var LAM_CTX
  - Spawn: deno run --allow-net --allow-env /tmp/fn_xyz.ts
  - Capture stdout as response
  - Timeout: 10 seconds
  - Cleanup temp file after run
```

---

## FRONTEND — React + TypeScript + Vite

### Setup
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom @tanstack/react-query zustand lucide-react
```

### Design System — TWO COLOR ONLY
```css
:root {
  --bg:      #0a0a0a;   /* Near black background */
  --surface: #111111;   /* Card / panel surface */
  --border:  #1f1f1f;   /* Subtle borders */
  --accent:  #e8ff47;   /* Electric lime — the ONLY color */
  --text:    #f0f0f0;   /* Primary text */
  --muted:   #555555;   /* Secondary text */

  /* Typography */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-ui:   'DM Sans', sans-serif;
}

/* Rule: Only --bg and --accent exist as colors.
   Everything else is opacity/tint of those two.
   No blues. No purples. No gradients.
   Sharp. Fast. Terminal-like. */
```

### Frontend Folder Structure
```
frontend/src/
├── main.tsx
├── App.tsx                   → Router setup
├── lib/
│   ├── lambase.ts           → API client (fetch wrapper to Go backend)
│   └── store.ts              → Zustand global state
├── pages/
│   ├── Dashboard.tsx         → Overview stats
│   ├── Tables.tsx            → Table list + create table UI
│   ├── TableEditor.tsx       → View/edit rows of a specific table
│   ├── Auth.tsx              → User management page
│   ├── Functions.tsx         → Monaco editor for edge functions
│   ├── Storage.tsx           → File buckets UI
│   ├── Realtime.tsx          → Live subscription monitor
│   └── Logs.tsx              → System logs viewer
├── components/
│   ├── Sidebar.tsx           → Left nav (icon + label, collapsed by default)
│   ├── TopBar.tsx            → Page title + status indicator (online dot)
│   ├── DataTable.tsx         → Reusable fast table component
│   ├── Button.tsx            → accent / ghost / danger variants
│   ├── Modal.tsx             → Simple overlay modal
│   ├── CodeEditor.tsx        → Monaco editor wrapper
│   └── StatusBadge.tsx       → Accent colored status pill
└── hooks/
    ├── useRealtime.ts        → WebSocket subscription hook
    └── useQuery.ts           → Data fetching hook
```

### UI Rules — Strict
```
✅ Black background only
✅ Electric lime (#e8ff47) for: active states, buttons, icons, highlights
✅ Monospace font for: all data, code, IDs, table names, numbers
✅ DM Sans for: labels, headings, descriptions
✅ No rounded corners above 4px
✅ Borders use --border color (near invisible)
✅ Hover = accent color text, no background change
✅ Loading state = simple blinking accent dot, no spinners
✅ Transitions max 150ms, ease-in-out only
✅ Dense information layout — no wasted whitespace
✅ Tables show raw data — monospace, tight row height (36px)

❌ No gradients
❌ No shadows
❌ No colorful icons (all icons = --muted, active = --accent)
❌ No cards with heavy padding
❌ No animations except 150ms transitions
```

### Sidebar Navigation
```
Icons only when collapsed (default), icon + label when expanded.
Nav items:
  ⬡ Dashboard
  ▦ Tables
  ⚡ Functions
  🔑 Auth
  📁 Storage
  📡 Realtime
  📋 Logs
  ⚙ Settings

Bottom of sidebar: LamBase version + a green/red dot for backend connection status
```

### lambase.ts — API Client
```typescript
// All API calls go through this client
// Base URL auto-detected: same origin in production, localhost:8000 in dev
const BASE = import.meta.env.DEV ? 'http://localhost:8000' : ''

export const api = {
  db: {
    list:   (table: string, params?: Record<string,string>) => get(`/api/v1/db/${table}`, params),
    get:    (table: string, id: string)                     => get(`/api/v1/db/${table}/${id}`),
    insert: (table: string, data: object)                   => post(`/api/v1/db/${table}`, data),
    update: (table: string, id: string, data: object)       => patch(`/api/v1/db/${table}/${id}`, data),
    delete: (table: string, id: string)                     => del(`/api/v1/db/${table}/${id}`),
  },
  schema: {
    tables: ()                              => get('/api/v1/schema/tables'),
    create: (name: string, cols: Column[])  => post('/api/v1/schema/tables', { name, columns: cols }),
    drop:   (name: string)                  => del(`/api/v1/schema/tables/${name}`),
  },
  auth: {
    signup:  (email: string, password: string) => post('/api/v1/auth/signup', { email, password }),
    signin:  (email: string, password: string) => post('/api/v1/auth/signin', { email, password }),
    signout: ()                                => post('/api/v1/auth/signout', {}),
    user:    ()                                => get('/api/v1/auth/user'),
  },
  functions: {
    list:   ()                              => get('/api/v1/functions'),
    deploy: (name: string, code: string)    => post(`/api/v1/functions/${name}/deploy`, { code }),
    invoke: (name: string, body: object)    => post(`/api/v1/functions/${name}/invoke`, body),
  },
  storage: {
    list:   (bucket: string) => get(`/api/v1/storage/${bucket}`),
    upload: (bucket: string, file: File) => upload(`/api/v1/storage/${bucket}`, file),
    delete: (bucket: string, id: string) => del(`/api/v1/storage/${bucket}/${id}`),
  }
}
```

---

## Build Command
```bash
# 1. Build frontend
cd frontend && npm run build  # outputs to frontend/dist

# 2. Build Go binary (embeds frontend/dist automatically)
go build -o lambase .

# 3. Run
./lambase --port 3000 --db ./lambase.db
```

---

## What To Deliver

1. **Complete `main.go`** — boots server, DB, embeds frontend
2. **Complete `core/server.go`** — all routes registered, CORS set, JWT middleware
3. **Complete `db/client.go`** — libSQL connect, query helper, auto-migrate internal tables
4. **Complete `core/schema.go`** — table creation + dynamic route registration
5. **Complete `core/auth.go`** — signup, signin, JWT issue/verify
6. **Complete `core/realtime.go`** — WebSocket hub, subscribe/emit
7. **Frontend `App.tsx`** — router with all pages
8. **Frontend `Sidebar.tsx`** — nav component with design system applied
9. **Frontend `Tables.tsx`** — list tables, create table modal
10. **Frontend `lambase.ts`** — full API client

No placeholder comments. No TODOs. Working code only.
Everything compiles and runs on first try.
