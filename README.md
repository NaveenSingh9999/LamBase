# LamBase (Prototype v0.1)

A fully self-hosted, open source backend platform. Single compiled binary.

## Project Structure

- `main.go`: Entry point
- `core/`: Core logic (Server, Schema Engine)
- `db/`: Database (PostgreSQL) connection & migrations
- `api/`: REST API handlers (Data access)
- `config/`: Configuration loader
- `frontend/`: React + Vite frontend source

## Prerequisites

- **Go 1.21+**
- **Node.js 18+** (for frontend build)
- **PostgreSQL** (running locally or remote)

## Automated Install + Run

LamBase includes a custom bootstrap binary that automates frontend build + backend build/start.

### Option A: Full setup script

```bash
./scripts/setup.sh
```

This script installs dependencies (apt/dnf), starts PostgreSQL, creates database defaults,
builds `lambase-bootstrap`, and prepares artifacts.

Then start LamBase:

```bash
./lambase-bootstrap
```

### Option A2: Termux-only setup script

For Android Termux environments, use the dedicated script:

```bash
chmod +x ./scripts/setup-termux.sh
./scripts/setup-termux.sh
```

It uses `pkg`, initializes Termux PostgreSQL storage, creates `lambase` DB,
builds `lambase-bootstrap`, and prepares frontend/backend artifacts.

### Option B: Bootstrap binary only

```bash
go build -o lambase-bootstrap ./cmd/lambase-bootstrap
./lambase-bootstrap
```

The bootstrap binary automatically:
- ensures `.env` exists
- ensures PostgreSQL database exists
- ensures `pgcrypto` extension exists
- installs frontend dependencies
- builds frontend assets
- builds backend binary and runs it

## How to Run (Phase 1)

### 1. Build Frontend

The Go binary embeds the frontend build artifacts. You must build the frontend first.
Ensure you have `npm` installed (e.g., via `apt-get install npm`).

```bash
cd frontend
npm install
npm run build
cd ..
```

### 2. Configure Environment

Create a `.env` file in the root (optional, defaults are provided):

```env
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/lambase?sslmode=disable
JWT_SECRET=your-secret-key
```

### 3. Run Backend

Compile and run the single binary:

```bash
go mod tidy
go build -o lambase
./lambase
```

### 4. Verify

Open your browser at `http://localhost:3000`.
You should see the LamBase dashboard where you can Create Tables and Manage Data.

To verify the API programmatically:
```bash
go run verify_backend.go
```

## Features Implemented (Phase 1)

- [x] Go + Fiber HTTP Server
- [x] PostgreSQL Connection
- [x] Custom Schema Engine (Create/Drop Tables)
- [x] Auto-generated REST API for any table (`GET /:table`, `POST /:table`)
- [x] React Dashboard (Tables List, Table Editor)
- [x] Embedded Frontend in Go Binary
