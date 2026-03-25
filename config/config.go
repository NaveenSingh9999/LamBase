package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                     string
	DatabaseURL              string
	JWTSecret                string
	DashboardAuthDBPath      string
	DashboardSessionHours    int
	DashboardLockoutMinutes  int
}

func Load() *Config {
	_ = godotenv.Load() // Ignore error if .env file is missing

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Default local postgres connection string
		dbURL = "postgres://postgres:postgres@localhost:5432/lambase?sslmode=disable"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "change-me-in-production-please"
	}

	dashboardDBPath := os.Getenv("DASHBOARD_AUTH_DB_PATH")
	if dashboardDBPath == "" {
		dashboardDBPath = "lambase_dashboard_auth.db"
	}

	sessionHours := 24
	if val := os.Getenv("DASHBOARD_SESSION_HOURS"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed > 0 {
			sessionHours = parsed
		}
	}

	lockoutMinutes := 15
	if val := os.Getenv("DASHBOARD_LOCKOUT_MINUTES"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed > 0 {
			lockoutMinutes = parsed
		}
	}

	return &Config{
		Port:                    port,
		DatabaseURL:             dbURL,
		JWTSecret:               jwtSecret,
		DashboardAuthDBPath:     dashboardDBPath,
		DashboardSessionHours:   sessionHours,
		DashboardLockoutMinutes: lockoutMinutes,
	}
}
