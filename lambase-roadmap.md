# LamBase — Project Overview & Roadmap
> Internal team document — v1.0

---

## The Problem We're Solving

Every developer building a web app, mobile app, or internal tool needs the same backend primitives:

- A database with a real API
- User authentication
- Live data updates
- File storage
- Business logic execution

**Supabase** solves this but is cloud-first, Postgres-heavy, and painful to self-host (12+ Docker containers).
**PocketBase** is close but has no edge functions, no GraphQL, and limited auth options.
**Appwrite** requires Docker and has no visual function editor.

**LamBase** solves all of it — single binary, runs anywhere, zero cloud dependency.

---

## The Product

```
One binary.
Runs on a laptop, VPS, or Raspberry Pi.
Open browser → full backend platform.
No coding to get started.
```

LamBase bundles a Go backend and a React dashboard into a single compiled binary.
Users download it, run it, and immediately have a production-grade backend.

---

## Target Users

| User Type | Pain Point LamBase Solves |
|---|---|
| Indie developers | Don't want cloud bills or lock-in |
| Startups | Need full backend fast, want to own infra |
| Internal tools teams | Need a quick backend for dashboards and tools |
| AI app builders | Need a backend that edge functions + AI can write for |
| Enterprises (air-gapped) | Cannot send data to external cloud services |
| Freelancers | Ship client projects with a self-contained backend |

---

## Tech Stack Summary

```
Backend       →  Go (Fiber HTTP framework)
Database      →  libSQL (SQLite-compatible, edge-native)
Auth          →  Go (JWT + bcrypt + OAuth2)
Realtime      →  Go WebSockets (goroutine-per-connection hub)
Edge Functions→  Deno subprocess (WinterCG / Cloudflare Workers interface)
File Storage  →  Local FS + S3-compatible API
Frontend      →  React + TypeScript + Vite (embedded in binary via go:embed)
SDKs          →  TypeScript + Python
```

---

## Build Roadmap

### Phase 1 — Core Foundation (Month 1)
**Goal: Working binary with DB + API + Dashboard skeleton**

- [ ] Go project setup with Fiber + libSQL
- [ ] `go:embed` frontend integration
- [ ] Internal table auto-migration on startup (`_users`, `_sessions`, `_functions`, `_storage`)
- [ ] Schema engine: create table → auto-generate 5 REST routes dynamically
- [ ] React TSX dashboard setup (Vite + Zustand + TanStack Query)
- [ ] Dashboard: Tables page — list + create table
- [ ] Dashboard: Table Editor — view + insert + edit + delete rows
- [ ] `lambase.ts` API client foundation
- [ ] Single binary build pipeline (Vite → Go embed → `go build`)

**Deliverable:** `./lambase` binary — create tables, CRUD data via API and dashboard.

---

### Phase 2 — Auth + Security (Month 2)
**Goal: Full authentication system with role-based access**

- [ ] Signup / signin / signout endpoints
- [ ] JWT issue and verification middleware
- [ ] bcrypt password hashing
- [ ] Session management in `_sessions` table
- [ ] Role-based access control (admin, user, custom)
- [ ] Row-level security policy engine
- [ ] OAuth2: Google + GitHub providers
- [ ] Magic link (passwordless) auth
- [ ] Dashboard: Auth page — user list, role assignment, session viewer

**Deliverable:** Complete auth system, any app can authenticate users through LamBase.

---

### Phase 3 — Realtime + Edge Functions (Month 3)
**Goal: Live data + server-side logic**

- [ ] WebSocket hub (Go channels, goroutine-per-connection)
- [ ] Subscribe to table events (INSERT / UPDATE / DELETE)
- [ ] Broadcast change records to all table subscribers
- [ ] Dashboard: Realtime monitor — live event stream, active subscribers
- [ ] Edge function runner: Deno subprocess invocation
- [ ] Monaco editor integration in dashboard Functions page
- [ ] Function deploy (save to `_functions`) + invoke endpoints
- [ ] `ctx` injection (db, auth, env, storage)
- [ ] Function logs capture and display
- [ ] Timeout enforcement (10s) + temp file cleanup

**Deliverable:** Live subscriptions working end-to-end. Edge functions writable and invocable in browser.

---

### Phase 4 — Storage + Webhooks + Logs (Month 4)
**Goal: Complete the platform surface**

- [ ] Local file storage with bucket management
- [ ] File upload / download / delete API
- [ ] S3-compatible storage API
- [ ] Dashboard: Storage page — bucket manager, file browser, upload UI
- [ ] Webhook engine — fire HTTP callbacks on DB events
- [ ] Webhook config UI in dashboard
- [ ] Query logs (every SQL query + duration)
- [ ] Auth logs (signups, signins, failures)
- [ ] Function logs (stdout/stderr per invocation)
- [ ] Dashboard: Logs page — real-time stream, filtering

**Deliverable:** All core features complete. Platform is usable end-to-end.

---

### Phase 5 — SDKs + GraphQL + Polish (Month 5)
**Goal: Production-ready with full SDK support**

- [ ] TypeScript SDK (`lambase-js`): db, auth, realtime, storage, functions
- [ ] Python SDK (`lambase-py`): db, auth, functions
- [ ] GraphQL auto-schema generation from user tables
- [ ] `POST /api/v1/graphql` endpoint
- [ ] Dashboard: API Explorer — live endpoint testing (Postman-like, built-in)
- [ ] Dashboard: Settings page — port, JWT secret, SMTP, OAuth config
- [ ] Dashboard: System overview stats on home page
- [ ] Binary packaging: Linux, macOS, Windows ARM + x64
- [ ] README, quickstart docs, example projects

**Deliverable:** Ship on GitHub. Full open source release.

---

### Phase 6 — Ecosystem (Month 6+)
**Goal: Community growth and monetization foundation**

- [ ] LamBase Cloud (managed hosting for teams that don't want to self-host)
- [ ] Plugin/extension system for community modules
- [ ] Scheduled edge functions (cron syntax)
- [ ] Database branching (dev/staging/prod environments)
- [ ] Import from Supabase / PocketBase (migration tool)
- [ ] CLI tool: `lam deploy`, `lam logs`, `lam backup`

---

## Team Responsibilities (Proposed)

| Area | Scope |
|---|---|
| Backend Core | Go binary, Fiber server, schema engine, auth, realtime |
| Edge Functions | Deno subprocess integration, ctx injection, function logs |
| Storage + Webhooks | File storage layer, webhook engine |
| Frontend Dashboard | React TSX, all dashboard pages, design system |
| SDKs | TypeScript SDK, Python SDK |
| DevOps | Binary packaging, cross-platform builds, GitHub Actions CI |

---

## Definition of Done — v1.0 Launch

```
✅ Single binary ships for Linux, macOS, Windows
✅ Run binary → full backend running in under 3 seconds
✅ Create table in dashboard → REST API live instantly
✅ Auth working end-to-end (email + OAuth)
✅ Realtime subscriptions firing on any table change
✅ Edge functions writable in browser, invokable via API
✅ File storage with bucket management working
✅ TypeScript SDK covers all major features
✅ Zero external runtime dependencies (no Node, no Python, no Docker)
✅ All internal tables auto-migrated on first run
✅ README with 5-minute quickstart guide
```

---

## Non-Goals for v1.0

- Multi-node clustering (single-node only in v1)
- Built-in backup scheduling (manual export only)
- Plugin marketplace
- Mobile dashboard app
- Paid cloud hosting tier

---

## Success Metrics

| Metric | Target |
|---|---|
| Binary cold start time | Under 3 seconds |
| API response time (simple query) | Under 5ms |
| Concurrent WebSocket connections | 10,000+ |
| Edge function cold start | Under 500ms |
| GitHub stars at launch | 500+ (organic) |
| Binary size | Under 30MB |

---

## Repository Structure

```
github.com/lambase/lambase      → Main binary (Go + embedded TSX)
github.com/lambase/lambase-js   → TypeScript / JavaScript SDK
github.com/lambase/lambase-py   → Python SDK
github.com/lambase/examples     → Example projects
```

---

## Quickstart (End State — What Users Experience)

```bash
# 1. Download
curl -L https://github.com/lambase/lambase/releases/latest/download/lambase -o lambase
chmod +x lambase

# 2. Run
./lambase --port 3000

# 3. Open browser
# http://localhost:3000
# Full backend platform. No config. No cloud. Yours.
```
