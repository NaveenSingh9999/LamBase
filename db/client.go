package db

import (
	"context"
	"fmt"
	"log"
	
	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Connect(databaseURL string) error {
	var err error
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return fmt.Errorf("unable to parse database URL: %v", err)
	}

	Pool, err = pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return fmt.Errorf("unable to connect to database: %v", err)
	}

	if err := Pool.Ping(context.Background()); err != nil {
		return fmt.Errorf("unable to ping database: %v", err)
	}

	log.Println("Connected to PostgreSQL database")
	return migrate()
}

func migrate() error {
	ctx := context.Background()

	// Internal tables schema for PostgreSQL
	schema := `
	CREATE TABLE IF NOT EXISTS "_users" (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT,
		role TEXT DEFAULT 'user',
		metadata JSONB,
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS "_sessions" (
		id TEXT PRIMARY KEY,
		user_id TEXT,
		token TEXT UNIQUE,
		expires_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS "_functions" (
		id TEXT PRIMARY KEY,
		name TEXT UNIQUE NOT NULL,
		code TEXT NOT NULL,
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS "_storage" (
		id TEXT PRIMARY KEY,
		bucket TEXT NOT NULL,
		filename TEXT NOT NULL,
		path TEXT NOT NULL,
		size BIGINT,
		mime_type TEXT,
		created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err := Pool.Exec(ctx, schema)
	if err != nil {
		return fmt.Errorf("migration failed: %v", err)
	}

	log.Println("Internal tables migrated successfully")
	return nil
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
