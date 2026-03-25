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
  orgs: {
    list: () => request('/api/v1/orgs'),
    create: (name: string) =>
      request('/api/v1/orgs', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  projects: {
    list: (orgId: string) => request(`/api/v1/orgs/${orgId}/projects`),
    create: (orgId: string, name: string) =>
      request(`/api/v1/orgs/${orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    get: (projectId: string) => request(`/api/v1/projects/${projectId}`),
    apiKeys: (projectId: string) => request(`/api/v1/projects/${projectId}/api-keys`),
    schemas: (projectId: string) => request(`/api/v1/projects/${projectId}/schemas`),
    tables: (projectId: string, schema: string) =>
      request(`/api/v1/projects/${projectId}/schemas/${schema}/tables`),
    createTable: (projectId: string, schema: string, name: string, columns: unknown[]) =>
      request(`/api/v1/projects/${projectId}/schemas/${schema}/tables`, {
        method: 'POST',
        body: JSON.stringify({ name, columns }),
      }),
    dropTable: (projectId: string, schema: string, table: string) =>
      request(`/api/v1/projects/${projectId}/schemas/${schema}/tables/${table}`, {
        method: 'DELETE',
      }),
    columns: (projectId: string, schema: string, table: string) =>
      request(`/api/v1/projects/${projectId}/schemas/${schema}/tables/${table}/columns`),
    relationships: (projectId: string, schema: string, table: string) =>
      request(`/api/v1/projects/${projectId}/schemas/${schema}/tables/${table}/relationships`),
    createRelationship: (
      projectId: string,
      schema: string,
      table: string,
      payload: { column: string; foreignSchema?: string; foreignTable: string; foreignColumn: string }
    ) =>
      request(`/api/v1/projects/${projectId}/schemas/${schema}/tables/${table}/relationships`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listRows: (projectId: string, schema: string, table: string) =>
      request(`/api/v1/projects/${projectId}/db/${schema}/${table}`),
    insertRow: (projectId: string, schema: string, table: string, data: object) =>
      request(`/api/v1/projects/${projectId}/db/${schema}/${table}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateRow: (projectId: string, schema: string, table: string, id: string, data: object) =>
      request(`/api/v1/projects/${projectId}/db/${schema}/${table}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteRow: (projectId: string, schema: string, table: string, id: string) =>
      request(`/api/v1/projects/${projectId}/db/${schema}/${table}/${id}`, {
        method: 'DELETE',
      }),
    sql: (projectId: string, query: string) =>
      request(`/api/v1/projects/${projectId}/sql`, {
        method: 'POST',
        body: JSON.stringify({ query }),
      }),
  },
}
