package core

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/lambase/lambase/config"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

const maxFailedLoginAttempts = 5

type dashboardAuthService struct {
	cfg *config.Config
	db  *sql.DB
}

type dashboardClaims struct {
	AdminID string `json:"admin_id"`
	Email   string `json:"email"`
	SID     string `json:"sid"`
	CSRF    string `json:"csrf"`
	jwt.RegisteredClaims
}

func newDashboardAuthService(cfg *config.Config) (*dashboardAuthService, error) {
	db, err := sql.Open("sqlite", cfg.DashboardAuthDBPath)
	if err != nil {
		return nil, fmt.Errorf("open dashboard auth db: %w", err)
	}

	if _, err := db.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set sqlite pragmas: %w", err)
	}

	if err := migrateDashboardAuthDB(db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &dashboardAuthService{cfg: cfg, db: db}, nil
}

func migrateDashboardAuthDB(db *sql.DB) error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS dashboard_admins (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS dashboard_sessions (
		id TEXT PRIMARY KEY,
		admin_id TEXT NOT NULL,
		token_hash TEXT NOT NULL,
		csrf_token TEXT NOT NULL,
		expires_at DATETIME NOT NULL,
		revoked_at DATETIME,
		ip_address TEXT,
		user_agent TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_admin_id ON dashboard_sessions(admin_id);
	CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires_at ON dashboard_sessions(expires_at);

	CREATE TABLE IF NOT EXISTS dashboard_login_attempts (
		email TEXT PRIMARY KEY,
		failed_count INTEGER NOT NULL DEFAULT 0,
		locked_until DATETIME,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		return fmt.Errorf("migrate dashboard auth db: %w", err)
	}
	return nil
}

func (s *dashboardAuthService) close() {
	if s.db != nil {
		_ = s.db.Close()
	}
}

func (s *dashboardAuthService) registerRoutes(app *fiber.App) {
	auth := app.Group("/api/v1/dashboard-auth")
	auth.Get("/bootstrap", s.handleBootstrap)
	auth.Post("/setup", s.requireSameOrigin, s.handleSetup)
	auth.Post("/signin", s.requireSameOrigin, s.handleSignin)
	auth.Get("/session", s.requireDashboardSession, s.handleSession)
	auth.Post("/signout", s.requireSameOrigin, s.requireDashboardSession, s.requireCSRFFromSession, s.handleSignout)
}

func (s *dashboardAuthService) requireSameOrigin(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet || c.Method() == fiber.MethodHead || c.Method() == fiber.MethodOptions {
		return c.Next()
	}
	origin := c.Get("Origin")
	referer := c.Get("Referer")
	host := strings.TrimSpace(c.Get("Host"))
	if host == "" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Request origin validation failed"})
	}

	valid := false
	if origin != "" {
		if u, err := url.Parse(origin); err == nil && sameOriginHostMatch(u.Host, host) {
			valid = true
		}
	}
	if !valid && referer != "" {
		if u, err := url.Parse(referer); err == nil && sameOriginHostMatch(u.Host, host) {
			valid = true
		}
	}
	if !valid {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Request origin validation failed"})
	}
	return c.Next()
}

func (s *dashboardAuthService) requireDashboardSession(c *fiber.Ctx) error {
	raw := c.Get("Authorization")
	if !strings.HasPrefix(raw, "Bearer ") {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Authentication required"})
	}

	tokenStr := strings.TrimPrefix(raw, "Bearer ")
	token, err := jwt.ParseWithClaims(tokenStr, &dashboardClaims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid session"})
	}

	claims, ok := token.Claims.(*dashboardClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid session"})
	}

	now := time.Now().UTC()
	if claims.ExpiresAt == nil || claims.ExpiresAt.Time.Before(now) {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session expired"})
	}

	tokenHash := hashToken(tokenStr)
	var dbCSRF string
	var expiresAt time.Time
	var revokedAt sql.NullTime
	err = s.db.QueryRow(`
		SELECT csrf_token, expires_at, revoked_at
		FROM dashboard_sessions
		WHERE id = ? AND admin_id = ? AND token_hash = ?
	`, claims.SID, claims.AdminID, tokenHash).Scan(&dbCSRF, &expiresAt, &revokedAt)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid session"})
	}

	if revokedAt.Valid || expiresAt.Before(now) || dbCSRF != claims.CSRF {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Session revoked"})
	}

	c.Locals("dashboard_admin_id", claims.AdminID)
	c.Locals("dashboard_admin_email", claims.Email)
	c.Locals("dashboard_session_id", claims.SID)
	c.Locals("dashboard_csrf", claims.CSRF)
	c.Locals("dashboard_jwt", tokenStr)
	return c.Next()
}

func (s *dashboardAuthService) requireCSRFFromSession(c *fiber.Ctx) error {
	if c.Method() == fiber.MethodGet || c.Method() == fiber.MethodHead || c.Method() == fiber.MethodOptions {
		return c.Next()
	}

	expected, _ := c.Locals("dashboard_csrf").(string)
	provided := c.Get("X-CSRF-Token")
	if expected == "" || provided == "" || subtleCompare(expected, provided) == false {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "CSRF validation failed"})
	}
	return c.Next()
}

func (s *dashboardAuthService) handleBootstrap(c *fiber.Ctx) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM dashboard_admins`).Scan(&count); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check setup status"})
	}
	return c.JSON(fiber.Map{"hasAdmin": count > 0})
}

func (s *dashboardAuthService) handleSetup(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if !isValidEmail(req.Email) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Enter a valid admin email"})
	}
	if err := validatePassword(req.Password); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var count int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM dashboard_admins`).Scan(&count); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to verify setup state"})
	}
	if count > 0 {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Setup is already completed"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to secure password"})
	}

	adminID := randomID(16)
	if _, err := s.db.Exec(`INSERT INTO dashboard_admins(id, email, password_hash) VALUES(?,?,?)`, adminID, req.Email, string(hash)); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create admin account"})
	}

	resp, err := s.issueSession(adminID, req.Email, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start session"})
	}
	return c.Status(fiber.StatusCreated).JSON(resp)
}

func (s *dashboardAuthService) handleSignin(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !isValidEmail(email) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Enter a valid email"})
	}
	if req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password is required"})
	}

	locked, lockErr := s.isLockedOut(email)
	if lockErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Unable to verify login policy"})
	}
	if locked {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "Too many failed attempts. Try again later."})
	}

	var adminID, hash string
	err := s.db.QueryRow(`SELECT id, password_hash FROM dashboard_admins WHERE email = ?`, email).Scan(&adminID, &hash)
	if err != nil {
		_ = s.recordFailedAttempt(email)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		_ = s.recordFailedAttempt(email)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid email or password"})
	}

	if err := s.resetFailedAttempts(email); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Unable to continue sign in"})
	}

	resp, err := s.issueSession(adminID, email, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to start session"})
	}

	return c.JSON(resp)
}

func (s *dashboardAuthService) handleSession(c *fiber.Ctx) error {
	email, _ := c.Locals("dashboard_admin_email").(string)
	csrf, _ := c.Locals("dashboard_csrf").(string)
	return c.JSON(fiber.Map{
		"authenticated": true,
		"admin": fiber.Map{
			"email": email,
		},
		"csrfToken": csrf,
	})
}

func (s *dashboardAuthService) handleSignout(c *fiber.Ctx) error {
	sid, _ := c.Locals("dashboard_session_id").(string)
	if sid != "" {
		_, _ = s.db.Exec(`UPDATE dashboard_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`, sid)
	}
	return c.JSON(fiber.Map{"success": true})
}

func (s *dashboardAuthService) issueSession(adminID, email, ip, userAgent string) (fiber.Map, error) {
	sid := randomID(18)
	csrfToken := randomID(18)
	expiresAt := time.Now().UTC().Add(time.Duration(s.cfg.DashboardSessionHours) * time.Hour)

	claims := dashboardClaims{
		AdminID: adminID,
		Email:   email,
		SID:     sid,
		CSRF:    csrfToken,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "lambase-dashboard",
			Subject:   adminID,
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			ID:        randomID(12),
		},
	}

	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := t.SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, err
	}

	_, err = s.db.Exec(`
		INSERT INTO dashboard_sessions(id, admin_id, token_hash, csrf_token, expires_at, ip_address, user_agent)
		VALUES(?,?,?,?,?,?,?)
	`, sid, adminID, hashToken(tokenStr), csrfToken, expiresAt, ip, userAgent)
	if err != nil {
		return nil, err
	}

	return fiber.Map{
		"token": tokenStr,
		"csrfToken": csrfToken,
		"expiresAt": expiresAt.UTC().Format(time.RFC3339),
		"admin": fiber.Map{"email": email},
	}, nil
}

func (s *dashboardAuthService) isLockedOut(email string) (bool, error) {
	var failedCount int
	var lockedUntil sql.NullTime
	err := s.db.QueryRow(`SELECT failed_count, locked_until FROM dashboard_login_attempts WHERE email = ?`, email).Scan(&failedCount, &lockedUntil)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return lockedUntil.Valid && lockedUntil.Time.After(time.Now().UTC()), nil
}

func (s *dashboardAuthService) recordFailedAttempt(email string) error {
	var failedCount int
	var lockedUntil sql.NullTime
	err := s.db.QueryRow(`SELECT failed_count, locked_until FROM dashboard_login_attempts WHERE email = ?`, email).Scan(&failedCount, &lockedUntil)
	now := time.Now().UTC()
	if err == sql.ErrNoRows {
		_, insErr := s.db.Exec(`INSERT INTO dashboard_login_attempts(email, failed_count, updated_at) VALUES(?,?,?)`, email, 1, now)
		return insErr
	}
	if err != nil {
		return err
	}

	if lockedUntil.Valid && lockedUntil.Time.Before(now) {
		failedCount = 0
	}

	failedCount++
	if failedCount >= maxFailedLoginAttempts {
		lockUntil := now.Add(time.Duration(s.cfg.DashboardLockoutMinutes) * time.Minute)
		_, err = s.db.Exec(`UPDATE dashboard_login_attempts SET failed_count = ?, locked_until = ?, updated_at = ? WHERE email = ?`, failedCount, lockUntil, now, email)
		return err
	}

	_, err = s.db.Exec(`UPDATE dashboard_login_attempts SET failed_count = ?, updated_at = ? WHERE email = ?`, failedCount, now, email)
	return err
}

func (s *dashboardAuthService) resetFailedAttempts(email string) error {
	_, err := s.db.Exec(`DELETE FROM dashboard_login_attempts WHERE email = ?`, email)
	return err
}

func randomID(size int) string {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return hex.EncodeToString(buf)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func subtleCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var out byte
	for i := 0; i < len(a); i++ {
		out |= a[i] ^ b[i]
	}
	return out == 0
}

func isValidEmail(email string) bool {
	if len(email) < 6 || len(email) > 254 {
		return false
	}
	at := strings.Index(email, "@")
	dot := strings.LastIndex(email, ".")
	return at > 0 && dot > at+1 && dot < len(email)-1
}

func validatePassword(password string) error {
	if len(password) < 12 {
		return errors.New("Password must be at least 12 characters")
	}
	var hasUpper, hasLower, hasDigit bool
	for _, ch := range password {
		switch {
		case ch >= 'A' && ch <= 'Z':
			hasUpper = true
		case ch >= 'a' && ch <= 'z':
			hasLower = true
		case ch >= '0' && ch <= '9':
			hasDigit = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit {
		return errors.New("Password must include uppercase, lowercase, and a number")
	}
	return nil
}

func sameOriginHostMatch(sourceHost, requestHost string) bool {
	if strings.EqualFold(sourceHost, requestHost) {
		return true
	}
	sHost, _, sErr := strings.Cut(sourceHost, ":")
	rHost, _, rErr := strings.Cut(requestHost, ":")
	if !sErr || !rErr {
		return false
	}
	loopback := map[string]bool{"localhost": true, "127.0.0.1": true, "::1": true}
	return loopback[strings.ToLower(sHost)] && loopback[strings.ToLower(rHost)]
}
