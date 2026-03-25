package core

import (
	"context"
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
	"github.com/google/uuid"
	"github.com/lambase/lambase/config"
	"github.com/lambase/lambase/db"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

const maxFailedLoginAttempts = 5

const (
	apiKeyAnon        = "anon"
	apiKeyServiceRole = "service_role"
)

type dashboardService struct {
	cfg       *config.Config
	db        *sql.DB
	projectDB *db.ProjectDBManager
}

type dashboardClaims struct {
	AdminID string `json:"admin_id"`
	Email   string `json:"email"`
	SID     string `json:"sid"`
	CSRF    string `json:"csrf"`
	jwt.RegisteredClaims
}

type organization struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type project struct {
	ID        string `json:"id"`
	OrgID     string `json:"orgId"`
	Name      string `json:"name"`
	DBName    string `json:"dbName"`
	CreatedAt string `json:"createdAt"`
}

type apiKey struct {
	KeyName  string `json:"keyName"`
	KeyValue string `json:"keyValue"`
}

func newDashboardService(cfg *config.Config, projectDB *db.ProjectDBManager) (*dashboardService, error) {
	dbConn, err := sql.Open("sqlite", cfg.DashboardAuthDBPath)
	if err != nil {
		return nil, fmt.Errorf("open dashboard auth db: %w", err)
	}

	if _, err := dbConn.Exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;`); err != nil {
		_ = dbConn.Close()
		return nil, fmt.Errorf("set sqlite pragmas: %w", err)
	}

	if err := migrateDashboardDB(dbConn); err != nil {
		_ = dbConn.Close()
		return nil, err
	}

	return &dashboardService{cfg: cfg, db: dbConn, projectDB: projectDB}, nil
}

func migrateDashboardDB(dbConn *sql.DB) error {
	_, err := dbConn.Exec(`
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

	CREATE TABLE IF NOT EXISTS organizations (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS organization_members (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		admin_id TEXT NOT NULL,
		role TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS projects (
		id TEXT PRIMARY KEY,
		org_id TEXT NOT NULL,
		name TEXT NOT NULL,
		db_name TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS project_api_keys (
		id TEXT PRIMARY KEY,
		project_id TEXT NOT NULL,
		key_name TEXT NOT NULL,
		key_value TEXT NOT NULL,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		return fmt.Errorf("migrate dashboard db: %w", err)
	}
	return nil
}

func (s *dashboardService) close() {
	if s.db != nil {
		_ = s.db.Close()
	}
}

func (s *dashboardService) registerAuthRoutes(app *fiber.App) {
	auth := app.Group("/api/v1/dashboard-auth")
	auth.Get("/bootstrap", s.handleBootstrap)
	auth.Post("/setup", s.requireSameOrigin, s.handleSetup)
	auth.Post("/signin", s.requireSameOrigin, s.handleSignin)
	auth.Get("/session", s.requireDashboardSession, s.handleSession)
	auth.Post("/signout", s.requireSameOrigin, s.requireDashboardSession, s.requireCSRFFromSession, s.handleSignout)
}

func (s *dashboardService) registerOrgRoutes(router fiber.Router) {
	orgs := router.Group("/orgs")
	orgs.Get("/", s.listOrganizations)
	orgs.Post("/", s.createOrganization)
	orgs.Get(":orgId/projects", s.listProjects)
	orgs.Post(":orgId/projects", s.createProject)
}

func (s *dashboardService) registerProjectRoutes(router fiber.Router) {
	projects := router.Group("/projects")
	projects.Get(":projectId", s.getProject)
	projects.Get(":projectId/api-keys", s.getProjectKeys)
	projects.Get(":projectId/schemas", s.listSchemas)
	projects.Get(":projectId/schemas/:schema/tables", s.listTables)
	projects.Post(":projectId/schemas/:schema/tables", s.createTable)
	projects.Delete(":projectId/schemas/:schema/tables/:table", s.dropTable)
	projects.Get(":projectId/schemas/:schema/tables/:table/columns", s.listColumns)
	projects.Get(":projectId/schemas/:schema/tables/:table/relationships", s.listRelationships)
	projects.Post(":projectId/schemas/:schema/tables/:table/relationships", s.createRelationship)
	projects.Get(":projectId/db/:schema/:table", s.listRows)
	projects.Get(":projectId/db/:schema/:table/:id", s.getRow)
	projects.Post(":projectId/db/:schema/:table", s.insertRow)
	projects.Patch(":projectId/db/:schema/:table/:id", s.updateRow)
	projects.Delete(":projectId/db/:schema/:table/:id", s.deleteRow)
	projects.Post(":projectId/sql", s.runSQL)
}

func (s *dashboardService) requireSameOrigin(c *fiber.Ctx) error {
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

func (s *dashboardService) requireDashboardSession(c *fiber.Ctx) error {
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

func (s *dashboardService) requireCSRFFromSession(c *fiber.Ctx) error {
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

func (s *dashboardService) handleBootstrap(c *fiber.Ctx) error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(1) FROM dashboard_admins`).Scan(&count); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to check setup status"})
	}
	return c.JSON(fiber.Map{"hasAdmin": count > 0})
}

func (s *dashboardService) handleSetup(c *fiber.Ctx) error {
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

func (s *dashboardService) handleSignin(c *fiber.Ctx) error {
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

func (s *dashboardService) handleSession(c *fiber.Ctx) error {
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

func (s *dashboardService) handleSignout(c *fiber.Ctx) error {
	sid, _ := c.Locals("dashboard_session_id").(string)
	if sid != "" {
		_, _ = s.db.Exec(`UPDATE dashboard_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?`, sid)
	}
	return c.JSON(fiber.Map{"success": true})
}

func (s *dashboardService) issueSession(adminID, email, ip, userAgent string) (fiber.Map, error) {
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

func (s *dashboardService) isLockedOut(email string) (bool, error) {
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

func (s *dashboardService) recordFailedAttempt(email string) error {
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

func (s *dashboardService) resetFailedAttempts(email string) error {
	_, err := s.db.Exec(`DELETE FROM dashboard_login_attempts WHERE email = ?`, email)
	return err
}

func (s *dashboardService) listOrganizations(c *fiber.Ctx) error {
	adminID := c.Locals("dashboard_admin_id").(string)
	rows, err := s.db.Query(`
		SELECT o.id, o.name, o.created_at
		FROM organizations o
		JOIN organization_members m ON m.org_id = o.id
		WHERE m.admin_id = ?
		ORDER BY o.created_at DESC
	`, adminID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load organizations"})
	}
	defer rows.Close()

	orgs := []organization{}
	for rows.Next() {
		var org organization
		if err := rows.Scan(&org.ID, &org.Name, &org.CreatedAt); err != nil {
			continue
		}
		orgs = append(orgs, org)
	}
	return c.JSON(orgs)
}

func (s *dashboardService) createOrganization(c *fiber.Ctx) error {
	adminID := c.Locals("dashboard_admin_id").(string)
	var req struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Organization name is required"})
	}

	orgID := randomID(12)
	_, err := s.db.Exec(`INSERT INTO organizations(id, name) VALUES(?, ?)`, orgID, strings.TrimSpace(req.Name))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to create organization"})
	}

	_, _ = s.db.Exec(`INSERT INTO organization_members(id, org_id, admin_id, role) VALUES(?, ?, ?, ?)`, randomID(12), orgID, adminID, "owner")

	return c.Status(201).JSON(fiber.Map{"id": orgID, "name": req.Name})
}

func (s *dashboardService) listProjects(c *fiber.Ctx) error {
	orgID := c.Params("orgId")
	rows, err := s.db.Query(`SELECT id, org_id, name, db_name, created_at FROM projects WHERE org_id = ? ORDER BY created_at DESC`, orgID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load projects"})
	}
	defer rows.Close()

	projects := []project{}
	for rows.Next() {
		var p project
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.DBName, &p.CreatedAt); err != nil {
			continue
		}
		projects = append(projects, p)
	}
	return c.JSON(projects)
}

func (s *dashboardService) createProject(c *fiber.Ctx) error {
	orgID := c.Params("orgId")
	var req struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.Name) == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Project name is required"})
	}

	projID := randomID(12)
	dbName := fmt.Sprintf("lambase_%s", strings.ToLower(projID))

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := s.projectDB.EnsureDatabase(ctx, dbName); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to provision project database"})
	}

	pool, err := s.projectDB.PoolFor(ctx, dbName)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to connect project database"})
	}
	if err := db.EnsureProjectSchemas(ctx, pool); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to initialize project schemas"})
	}

	_, err = s.db.Exec(`INSERT INTO projects(id, org_id, name, db_name) VALUES(?, ?, ?, ?)`, projID, orgID, strings.TrimSpace(req.Name), dbName)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to save project"})
	}

	anonKey := generateAPIKey("anon")
	serviceKey := generateAPIKey("service")

	_, _ = s.db.Exec(`INSERT INTO project_api_keys(id, project_id, key_name, key_value) VALUES(?, ?, ?, ?)`, randomID(12), projID, apiKeyAnon, anonKey)
	_, _ = s.db.Exec(`INSERT INTO project_api_keys(id, project_id, key_name, key_value) VALUES(?, ?, ?, ?)`, randomID(12), projID, apiKeyServiceRole, serviceKey)

	return c.Status(201).JSON(fiber.Map{
		"id": projID,
		"orgId": orgID,
		"name": req.Name,
		"dbName": dbName,
	})
}

func (s *dashboardService) getProject(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	var p project
	if err := s.db.QueryRow(`SELECT id, org_id, name, db_name, created_at FROM projects WHERE id = ?`, projectID).Scan(&p.ID, &p.OrgID, &p.Name, &p.DBName, &p.CreatedAt); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Project not found"})
	}
	return c.JSON(p)
}

func (s *dashboardService) getProjectKeys(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	rows, err := s.db.Query(`SELECT key_name, key_value FROM project_api_keys WHERE project_id = ?`, projectID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to load API keys"})
	}
	defer rows.Close()
	keys := []apiKey{}
	for rows.Next() {
		var k apiKey
		if err := rows.Scan(&k.KeyName, &k.KeyValue); err != nil {
			continue
		}
		keys = append(keys, k)
	}
	return c.JSON(keys)
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

func generateAPIKey(prefix string) string {
	key := uuid.New().String()
	return fmt.Sprintf("%s_%s", prefix, strings.ReplaceAll(key, "-", ""))
}
