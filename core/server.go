package core

import (
	"embed"
	"io/fs"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
	"github.com/lambase/lambase/api"
	"github.com/lambase/lambase/config"
)

func NewServer(cfg *config.Config, staticFS embed.FS) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName: "LamBase v1.0",
		DisableStartupMessage: true,
	})

	authService, err := newDashboardAuthService(cfg)
	if err != nil {
		log.Fatal("Failed to initialize dashboard auth:", err)
	}
	app.Hooks().OnShutdown(func() error {
		authService.close()
		return nil
	})

	// Middleware
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*", // For development flexibility
		AllowHeaders: "Origin, Content-Type, Accept, Authorization, X-CSRF-Token",
	}))

	// Public dashboard auth routes
	authService.registerRoutes(app)

	// Protected dashboard APIs
	protected := app.Group("/api/v1", authService.requireDashboardSession)
	protected.Use(authService.requireCSRFFromSession)
	RegisterSchemaRoutes(protected)
	api.RegisterDBRoutes(protected)

	// Serve Embedded Frontend
	// dist/ folder inside embed.FS
	// If the folder is empty (dev mode), we might want to skip or show a message.
	dist, err := fs.Sub(staticFS, "frontend/dist")
	if err != nil {
		log.Fatal("Failed to load embedded frontend:", err)
	}

	app.Use("/", filesystem.New(filesystem.Config{
		Root:   http.FS(dist),
		Browse: false,
		Index:  "index.html",
	}))

	// SPA Fallback: if not found, serve index.html
	app.Use("*", func(c *fiber.Ctx) error {
		return filesystem.SendFile(c, http.FS(dist), "index.html")
	})

	return app
}
