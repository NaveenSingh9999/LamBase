package main

import (
	"embed"
	"fmt"
	"log"

	"github.com/lambase/lambase/config"
	"github.com/lambase/lambase/core"
)

//go:embed frontend/dist/*
var frontendFS embed.FS

func main() {
	// 1. Load config
	cfg := config.Load()

	// 2. Start Server
	app := core.NewServer(cfg, frontendFS)

	fmt.Printf(`
┌──────────────────────────────────────────────────┐
│              LamBase Server Running              │
│                                                  │
│   > UI:      http://localhost:%s               │
│   > API:     http://localhost:%s/api/v1      │
│   > DB:      PostgreSQL                          │
	└──────────────────────────────────────────────────┘
`, cfg.Port, cfg.Port)

	log.Fatal(app.Listen(":" + cfg.Port))
}
