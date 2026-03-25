package db

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ProjectDBManager struct {
	adminURL string
	mu       sync.Mutex
	pools    map[string]*pgxpool.Pool
}

func NewProjectDBManager(adminURL string) *ProjectDBManager {
	return &ProjectDBManager{
		adminURL: adminURL,
		pools:    map[string]*pgxpool.Pool{},
	}
}

func (m *ProjectDBManager) EnsureDatabase(ctx context.Context, dbName string) error {
	adminCfg, err := pgxpool.ParseConfig(m.adminURL)
	if err != nil {
		return fmt.Errorf("parse admin database url: %w", err)
	}
	adminCfg.ConnConfig.Database = "postgres"

	adminPool, err := pgxpool.NewWithConfig(ctx, adminCfg)
	if err != nil {
		return fmt.Errorf("connect admin database: %w", err)
	}
	defer adminPool.Close()

	var exists bool
	if err := adminPool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, dbName).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		query := fmt.Sprintf("CREATE DATABASE \"%s\"", strings.ReplaceAll(dbName, "\"", "\"\""))
		if _, err := adminPool.Exec(ctx, query); err != nil {
			return err
		}
	}

	return nil
}

func (m *ProjectDBManager) PoolFor(ctx context.Context, dbName string) (*pgxpool.Pool, error) {
	m.mu.Lock()
	if pool, ok := m.pools[dbName]; ok {
		m.mu.Unlock()
		return pool, nil
	}
	m.mu.Unlock()

	cfg, err := pgxpool.ParseConfig(m.adminURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.ConnConfig.Database = dbName
	// Use shorter connection timeouts for faster feedback in UI.
	cfg.MaxConnLifetime = 45 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	m.pools[dbName] = pool
	m.mu.Unlock()

	return pool, nil
}

func (m *ProjectDBManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for key, pool := range m.pools {
		pool.Close()
		delete(m.pools, key)
	}
}

func EnsureProjectSchemas(ctx context.Context, pool *pgxpool.Pool) error {
	schemaSQL := `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  confirmation_token TEXT,
  confirmation_sent_at TIMESTAMPTZ,
  recovery_token TEXT,
  recovery_sent_at TIMESTAMPTZ,
  email_change_token_new TEXT,
  email_change TEXT,
  email_change_sent_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  refresh_token TEXT UNIQUE,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES auth.sessions(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  parent TEXT,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  identity_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
  id UUID PRIMARY KEY,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage.buckets (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  owner UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  public BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY,
  bucket_id UUID REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);
`

	_, err := pool.Exec(ctx, schemaSQL)
	return err
}
