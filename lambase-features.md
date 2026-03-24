# LamBase — Features & Capabilities
> Internal team document — v1.0

---

## Core Philosophy

```
No cloud lock-in.
No coding to set up.
No Docker complexity.
One binary. Runs anywhere. Owned by you forever.
```

---

## Feature 1 — Visual Database Builder

**What it does:**
Create, edit, and manage database tables through a browser UI with no SQL required.

**Capabilities:**
- Create tables with custom columns, types, and constraints
- Supported column types: `text`, `integer`, `real`, `boolean`, `json`, `datetime`, `uuid`
- Set primary keys, unique constraints, default values
- Add, rename, and drop columns on existing tables
- Visual row editor — insert, update, delete records directly from dashboard
- Filter, sort, and paginate table data
- View raw SQL for any operation (transparency mode)

**Auto-generated instantly on table creation:**
- REST API endpoints (5 routes per table)
- GraphQL schema entry
- Realtime WebSocket channel
- OpenAPI documentation entry

---

## Feature 2 — Auto REST + GraphQL API

**What it does:**
Every table you create instantly has a full CRUD API — zero code, zero config.

**REST endpoints (auto-generated):**
```
GET    /api/v1/db/:table              → list rows (filter, sort, limit, offset)
GET    /api/v1/db/:table/:id          → single row
POST   /api/v1/db/:table              → insert row
PATCH  /api/v1/db/:table/:id          → update row
DELETE /api/v1/db/:table/:id          → delete row
```

**Query parameters supported:**
```
?filter[status]=active
?sort=created_at:desc
?limit=20&offset=40
?select=id,name,email
```

**GraphQL:**
- Auto-generated schema from all user tables
- Single endpoint: `POST /api/v1/graphql`
- Supports queries and mutations

---

## Feature 3 — Authentication System

**What it does:**
Complete user management out of the box — no external auth service needed.

**Auth methods:**
- Email + password (bcrypt hashed)
- Magic link (passwordless email login)
- OAuth2: Google, GitHub (configure provider credentials in dashboard)

**Token system:**
- JWT issued on signin
- Configurable expiry
- Session tracking in `_sessions` table
- Signout invalidates session server-side

**User management dashboard:**
- View all users
- Assign roles
- Disable/delete accounts
- View active sessions

**Row-level security:**
- Define per-table access policies
- Example: `user can only read rows where user_id = auth.uid`
- Policies evaluated server-side on every request

---

## Feature 4 — Realtime Subscriptions

**What it does:**
Listen to any table for live changes — inserts, updates, deletes — over WebSocket.

**How it works:**
```javascript
// Client SDK usage
const client = createClient('http://localhost:3000', 'anon-key')

client.channel('orders')
  .on('INSERT', (record) => console.log('New order:', record))
  .on('UPDATE', (record) => console.log('Updated:', record))
  .on('DELETE', (record) => console.log('Deleted:', record))
  .subscribe()
```

**Technical details:**
- WebSocket endpoint: `ws://localhost:{port}/api/v1/realtime`
- In-memory pub/sub hub using Go channels
- One goroutine per client connection — handles 10,000+ concurrent subscribers
- Change events fired automatically after any successful DB write
- Payload includes: table, event type, full new record, old record (on update/delete)

**Dashboard:**
- Live subscription monitor page
- See all active subscribers
- See event stream in real-time for any table

---

## Feature 5 — Edge Functions

**What it does:**
Write and deploy server-side TypeScript functions that run inside LamBase — for complex business logic, webhooks, third-party integrations, scheduled jobs.

**Interface standard — WinterCG / Cloudflare Workers:**
```typescript
// Any AI generates this perfectly. No custom docs needed.
export default {
  async fetch(request: Request, ctx: LamContext): Promise<Response> {
    const { userId } = await request.json()
    const user = await ctx.db.from('users').select('*').eq('id', userId)
    return new Response(JSON.stringify(user))
  }
}
```

**Context object (`ctx`) — the only custom API:**
```typescript
interface LamContext {
  db: QueryBuilder        // query any LamBase table
  auth: { user: () => User | null }  // current authenticated user
  env: Record<string, string>        // env vars set in dashboard
  storage: StorageClient             // access file buckets
}
```

**Deployment:**
- Write function in Monaco editor in browser
- Click Deploy — live in under 1 second
- Invoke via HTTP: `POST /api/v1/functions/:name/invoke`

**Runtime:**
- Powered by Deno — TypeScript native, no transpilation
- NPM packages supported: `import Stripe from 'npm:stripe'`
- Timeout: 10 seconds per invocation
- Logs captured and viewable in dashboard

**Example use cases:**
- Stripe payment processing
- Sending emails via Resend/SendGrid
- Webhook receivers
- Data transformation pipelines
- Scheduled cleanup jobs
- Third-party API integrations

---

## Feature 6 — File Storage

**What it does:**
Upload, manage, and serve files — images, documents, videos — with a bucket-based system.

**Capabilities:**
- Create named buckets (e.g. `avatars`, `documents`, `uploads`)
- Upload files via dashboard or API
- Public or private buckets (private requires JWT)
- Direct file URLs for serving in frontend apps
- File metadata stored in `_storage` table
- S3-compatible API for drop-in tool support

**API:**
```
POST   /api/v1/storage/:bucket        upload file
GET    /api/v1/storage/:bucket        list files
GET    /api/v1/storage/:bucket/:id    download file
DELETE /api/v1/storage/:bucket/:id    delete file
```

---

## Feature 7 — Dashboard UI

**What it does:**
A complete admin panel served directly from the binary — no separate frontend deployment.

**Pages:**
| Page | Purpose |
|---|---|
| Dashboard | System overview — tables count, user count, function count, storage used, realtime connections |
| Tables | List all tables, create new table, view schema |
| Table Editor | Browse, filter, insert, edit, delete rows |
| Auth | User list, roles, sessions, OAuth config |
| Functions | Monaco code editor, deploy, invoke, view logs |
| Storage | Bucket manager, file upload/download |
| Realtime | Live event monitor, active subscribers |
| Logs | Query logs, auth logs, function logs, system logs |
| Settings | Port, DB path, JWT secret, SMTP, OAuth providers |

**Design:**
- Two-color system: black + electric lime
- Monospace font for all data
- Terminal-like density — no wasted whitespace
- Sub-150ms transitions — feels instant

---

## Feature 8 — Client SDKs

**What it does:**
Drop-in client libraries for connecting any app to LamBase.

**JavaScript / TypeScript SDK:**
```typescript
import { createClient } from 'lambase-js'

const client = createClient('http://localhost:3000', 'anon-key')

// Database
await client.from('posts').select('*').eq('published', true)
await client.from('posts').insert({ title: 'Hello', body: '...' })

// Auth
await client.auth.signInWithPassword({ email, password })
await client.auth.signUp({ email, password })

// Realtime
client.channel('posts').on('INSERT', callback).subscribe()

// Storage
await client.storage.from('avatars').upload(file)

// Edge Functions
await client.functions.invoke('send-email', { to: 'user@example.com' })
```

**Python SDK:**
```python
from lambase import Client

client = Client('http://localhost:3000', 'anon-key')
rows = client.table('orders').select('*').eq('status', 'pending').execute()
```

**Works with:**
- React, Vue, Svelte, Angular
- React Native, Flutter (via HTTP)
- Python backends
- Any HTTP client

---

## Feature 9 — Webhooks

**What it does:**
Trigger HTTP callbacks to external URLs on any database event.

**Configuration (via dashboard):**
- Select table and event type (INSERT / UPDATE / DELETE)
- Enter target URL
- Optional: custom headers, secret for signature verification

**Payload:**
```json
{
  "table": "orders",
  "event": "INSERT",
  "record": { "id": "abc", "amount": 99 },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

---

## Feature 10 — Logs & Observability

**What it does:**
Full visibility into everything happening inside LamBase.

**Log types:**
- Query logs — every SQL query with duration
- Auth logs — signups, signins, failures
- Function logs — stdout/stderr from every edge function invocation
- System logs — startup, errors, config changes

**Dashboard:**
- Real-time log stream
- Filter by type, table, user, time range
- Export logs as JSON or CSV

---

## Comparison vs Alternatives

| Feature | LamBase | Supabase | PocketBase | Appwrite |
|---|---|---|---|---|
| Self-hosted | ✅ | ⚠️ Complex | ✅ | ✅ Docker only |
| Single binary | ✅ | ❌ | ✅ | ❌ |
| No coding to set up | ✅ | ✅ | ✅ | ✅ |
| Edge functions | ✅ Deno | ✅ Deno | ❌ | ✅ |
| WinterCG functions | ✅ | ✅ | ❌ | ❌ |
| Realtime | ✅ | ✅ | ✅ | ✅ |
| GraphQL | ✅ | ✅ | ❌ | ❌ |
| Offline / air-gapped | ✅ | ❌ | ✅ | ✅ |
| JS + Python SDKs | ✅ | ✅ | ✅ | ✅ |
| Visual function editor | ✅ | ✅ | ❌ | ✅ |
| Open source | ✅ | ✅ | ✅ | ✅ |
| Row-level security | ✅ | ✅ | ⚠️ | ✅ |
