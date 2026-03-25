import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Tables from './pages/Tables'
import TableEditor from './pages/TableEditor'
import { api, setSessionState } from './lib/lambase'
import { clearSessionEncrypted, loadSessionEncrypted, saveSessionEncrypted } from './lib/secureSession'

const queryClient = new QueryClient()

type AuthMode = 'boot' | 'setup' | 'login' | 'dashboard'

type AuthEnvelope = {
  token: string
  csrfToken: string
  admin: { email: string }
  expiresAt: string
}

function Layout({ children }: { children: React.ReactNode }) {
  const [busySignout, setBusySignout] = useState(false)

  const handleSignout = async () => {
    setBusySignout(true)
    try {
      await api.auth.signout()
    } catch {
      // Even if API fails, clear local session to force re-auth.
    }
    setSessionState(null)
    clearSessionEncrypted()
    localStorage.clear()
    sessionStorage.clear()
    window.location.reload()
  }

  return (
    <div className="dash-shell">
      <nav className="dash-nav">
        <div>
          <h1>LamBase</h1>
          <p>Offline backend control plane</p>
        </div>
        <ul>
          <li>
            <Link to="/tables">Tables</Link>
          </li>
          <li>
            <span>Edge Functions (Soon)</span>
          </li>
        </ul>
        <button className="ghost-btn" onClick={handleSignout} disabled={busySignout}>
          {busySignout ? 'Signing out...' : 'Sign out'}
        </button>
      </nav>
      <main className="dash-main">{children}</main>
    </div>
  )
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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await props.onSubmit(email, password)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-ambient" />
      <form className="auth-card" onSubmit={submit}>
        <div className="eyebrow">Lambase Dashboard Access</div>
        <h2>{props.title}</h2>
        <p>{props.subtitle}</p>

        <label>Email</label>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@localhost"
          required
        />

        <label>Password</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter a strong password"
          required
        />

        <div className="password-hint">
          <span>Password quality</span>
          <div className="meter">
            <div style={{ width: `${(strength / 4) * 100}%` }} />
          </div>
          <span>{strength < 2 ? 'Weak' : strength < 4 ? 'Good' : 'Strong'}</span>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={busy}>
          {busy ? props.loadingText : props.buttonText}
        </button>
      </form>
    </div>
  )
}

function AppCore() {
  const [mode, setMode] = useState<AuthMode>('boot')

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

  if (mode === 'boot') {
    return (
      <div className="loading-screen">
        <div className="pulse" />
        <p>Preparing your LamBase control plane...</p>
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
      <Layout>
        <Routes>
          <Route path="/" element={<Tables />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/tables/:name" element={<TableEditor />} />
        </Routes>
      </Layout>
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
