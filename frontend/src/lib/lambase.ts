const BASE = window.location.hostname === 'localhost' && window.location.port === '5173'
  ? 'http://localhost:3000'
  : ''

type SessionState = {
  token: string
  csrfToken: string
}

let sessionState: SessionState | null = null

export function setSessionState(state: SessionState | null) {
  sessionState = state
}

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Content-Type', 'application/json')

  if (sessionState?.token) {
    headers.set('Authorization', `Bearer ${sessionState.token}`)
  }

  const method = (options.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && sessionState?.csrfToken) {
    headers.set('X-CSRF-Token', sessionState.csrfToken)
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error || res.statusText)
  }

  if (res.status === 204) return null

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const api = {
  auth: {
    bootstrap: () => request('/api/v1/dashboard-auth/bootstrap'),
    setup: (email: string, password: string) =>
      request('/api/v1/dashboard-auth/setup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    signin: (email: string, password: string) =>
      request('/api/v1/dashboard-auth/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    session: () => request('/api/v1/dashboard-auth/session'),
    signout: () => request('/api/v1/dashboard-auth/signout', { method: 'POST' }),
  },
  db: {
    list: (table: string) => request(`/api/v1/db/${table}`),
    insert: (table: string, data: object) =>
      request(`/api/v1/db/${table}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (table: string, id: string, data: object) =>
      request(`/api/v1/db/${table}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (table: string, id: string) =>
      request(`/api/v1/db/${table}/${id}`, {
        method: 'DELETE',
      }),
  },
  schema: {
    tables: () => request('/api/v1/schema/tables'),
    create: (name: string, columns: unknown[]) =>
      request('/api/v1/schema/tables', {
        method: 'POST',
        body: JSON.stringify({ name, columns }),
      }),
    drop: (name: string) =>
      request(`/api/v1/schema/tables/${name}`, {
        method: 'DELETE',
      }),
  },
}
