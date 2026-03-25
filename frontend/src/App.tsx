import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleNotch, LockKey } from '@phosphor-icons/react'
import { AppShell } from './components/AppShell'
import { MotionButton, PageFrame } from './components/ui'
import { api, setSessionState } from './lib/lambase'
import { clearSessionEncrypted, loadSessionEncrypted, saveSessionEncrypted } from './lib/secureSession'

const queryClient = new QueryClient()

const Orgs = lazy(() => import('./pages/Orgs.tsx'))
const Projects = lazy(() => import('./pages/Projects.tsx'))
const ProjectOverview = lazy(() => import('./pages/ProjectOverview.tsx'))
const Tables = lazy(() => import('./pages/Tables.tsx'))
const TableEditor = lazy(() => import('./pages/TableEditor.tsx'))
const SqlRunner = lazy(() => import('./pages/SqlRunner.tsx'))

type AuthMode = 'boot' | 'setup' | 'login' | 'dashboard'

type AuthEnvelope = {
  token: string
  csrfToken: string
  admin: { email: string }
  expiresAt: string
}

function AuthCard(props: {
  title: string
  subtitle: string
  buttonText: string
  loadingText: string
  onSubmit: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const strength = useMemo(() => {
    let score = 0
    if (password.length >= 12) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    return score
  }, [password])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await props.onSubmit(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.4, 0.55, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute -top-20 left-[15%] h-80 w-80 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-[10%] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </motion.div>

      <motion.form
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -18 }}
        transition={{ duration: 0.3 }}
        onSubmit={submit}
        className="relative z-10 grid w-full max-w-xl gap-3 rounded-3xl border border-border bg-panel/95 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="mb-1 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-accent/20 text-accent">
            <LockKey size={24} weight="regular" />
          </div>
          <p className="font-display text-3xl">LamBase</p>
        </div>
        <p className="text-xs uppercase tracking-[0.14em] text-accent">Secure Dashboard Access</p>
        <h2 className="font-display text-4xl leading-tight">{props.title}</h2>
        <p className="mb-3 text-sm text-muted">{props.subtitle}</p>

        <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Email</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@localhost"
          className="h-12 rounded-2xl border border-border bg-bg-soft px-4 text-sm outline-none transition duration-200 focus:border-accent focus:shadow-[0_0_0_4px_rgba(190,250,47,0.12)]"
          required
        />

        <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Use a strong password"
          className="h-12 rounded-2xl border border-border bg-bg-soft px-4 text-sm outline-none transition duration-200 focus:border-accent focus:shadow-[0_0_0_4px_rgba(190,250,47,0.12)]"
          required
        />

        <div className="mt-1 space-y-2 text-xs text-muted">
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-soft">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#8acd20] to-accent"
              animate={{ width: `${(strength / 4) * 100}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <p>Password quality: {strength < 2 ? 'Weak' : strength < 4 ? 'Good' : 'Strong'}</p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-danger/50 bg-danger/10 px-4 py-2 text-sm text-rose-200"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <MotionButton
          type="submit"
          disabled={busy}
          className="mt-2 h-12 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? props.loadingText : props.buttonText}
        </MotionButton>
      </motion.form>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <Suspense fallback={<RouteLoading />}> 
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.3 }}
        >
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/orgs" replace />} />
            <Route path="/orgs" element={<Orgs />} />
            <Route path="/orgs/:orgId/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectOverview />} />
            <Route path="/projects/:projectId/tables" element={<Tables />} />
            <Route path="/projects/:projectId/tables/:schema/:table" element={<TableEditor />} />
            <Route path="/projects/:projectId/sql" element={<SqlRunner />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Suspense>
  )
}

function RouteLoading() {
  return (
    <PageFrame>
      <div className="grid min-h-[70vh] place-items-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          className="text-accent"
        >
          <CircleNotch size={36} weight="regular" />
        </motion.div>
      </div>
    </PageFrame>
  )
}

function AppCore() {
  const [mode, setMode] = useState<AuthMode>('boot')
  const [busySignout, setBusySignout] = useState(false)

  const applySession = async (payload: AuthEnvelope) => {
    setSessionState({ token: payload.token, csrfToken: payload.csrfToken })
    await saveSessionEncrypted({
      token: payload.token,
      csrfToken: payload.csrfToken,
      adminEmail: payload.admin.email,
      expiresAt: payload.expiresAt,
    })
  }

  useEffect(() => {
    const boot = async () => {
      try {
        const bootstrap = await api.auth.bootstrap()
        if (!bootstrap.hasAdmin) {
          setMode('setup')
          return
        }

        const persisted = await loadSessionEncrypted()
        if (!persisted) {
          setSessionState(null)
          setMode('login')
          return
        }

        setSessionState({ token: persisted.token, csrfToken: persisted.csrfToken })
        await api.auth.session()
        setMode('dashboard')
      } catch {
        setSessionState(null)
        clearSessionEncrypted()
        setMode('login')
      }
    }

    void boot()
  }, [])

  const handleSetup = async (email: string, password: string) => {
    const response = (await api.auth.setup(email, password)) as AuthEnvelope
    await applySession(response)
    setMode('dashboard')
  }

  const handleSignin = async (email: string, password: string) => {
    const response = (await api.auth.signin(email, password)) as AuthEnvelope
    await applySession(response)
    setMode('dashboard')
  }

  const handleSignout = async () => {
    setBusySignout(true)
    try {
      await api.auth.signout()
    } catch {
      // Sign out should still clear local state if request fails.
    }
    setSessionState(null)
    clearSessionEncrypted()
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
  }

  if (mode === 'boot') {
    return (
      <div className="grid min-h-screen place-items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          className="text-accent"
        >
          <CircleNotch size={42} weight="regular" />
        </motion.div>
        <p className="text-sm text-muted">Preparing your LamBase control plane...</p>
      </div>
    )
  }

  if (mode === 'setup') {
    return (
      <AuthCard
        title="Create Your First LamBase Admin"
        subtitle="This setup runs once for your instance. Secure it with a strong admin account."
        buttonText="Initialize Dashboard"
        loadingText="Creating admin..."
        onSubmit={handleSetup}
      />
    )
  }

  if (mode === 'login') {
    return (
      <AuthCard
        title="Welcome Back"
        subtitle="Sign in to access your offline backend control plane."
        buttonText="Sign In"
        loadingText="Authenticating..."
        onSubmit={handleSignin}
      />
    )
  }

  return (
    <BrowserRouter>
      <AppShell onSignout={handleSignout} signingOut={busySignout}>
        <AnimatedRoutes />
      </AppShell>
    </BrowserRouter>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppCore />
    </QueryClientProvider>
  )
}

export default App
