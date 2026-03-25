import {
  Buildings,
  CaretDown,
  ChartLineUp,
  Database,
  Folders,
  Function,
  GearSix,
  HardDrives,
  LockKey,
  SquaresFour,
  WifiHigh,
  WifiSlash,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/lambase'
import { MotionButton } from './ui'

type IconWeight = 'regular' | 'bold' | 'duotone' | 'thin'

type NavItem = {
  label: string
  to: (projectId: string | undefined) => string
  icon: typeof SquaresFour
  requireProject?: boolean
}

const navGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Database',
    items: [
      { label: 'Overview', to: (projectId) => `/projects/${projectId}`, icon: SquaresFour, requireProject: true },
      { label: 'Table Editor', to: (projectId) => `/projects/${projectId}/tables`, icon: Database, requireProject: true },
    ],
  },
  {
    title: 'Auth',
    items: [{ label: 'Users', to: (projectId) => `/projects/${projectId}`, icon: LockKey, requireProject: true }],
  },
  {
    title: 'Storage',
    items: [{ label: 'Buckets', to: (projectId) => `/projects/${projectId}`, icon: HardDrives, requireProject: true }],
  },
  {
    title: 'Functions',
    items: [{ label: 'Edge Functions', to: (projectId) => `/projects/${projectId}`, icon: Function, requireProject: true }],
  },
  {
    title: 'Observe',
    items: [{ label: 'SQL Runner', to: (projectId) => `/projects/${projectId}/sql`, icon: ChartLineUp, requireProject: true }],
  },
  {
    title: 'Project Settings',
    items: [{ label: 'General', to: (projectId) => `/projects/${projectId}`, icon: GearSix, requireProject: true }],
  },
]

function Switcher({
  title,
  value,
  options,
  onSelect,
  icon,
}: {
  title: string
  value?: { id: string; name: string }
  options: Array<{ id: string; name: string }>
  onSelect: (id: string) => void
  icon: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</p>
      <div className="relative">
        <MotionButton
          className="flex h-12 w-full items-center justify-between rounded-2xl border border-border bg-panel-soft/90 px-3 text-left transition-colors hover:border-accent/50"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent">{icon}</span>
            <span className="truncate text-sm font-medium text-text">{value?.name || `Select ${title.toLowerCase()}`}</span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <CaretDown size={16} weight={'regular' satisfies IconWeight} className="text-muted" />
          </motion.span>
        </MotionButton>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scaleY: 0.9, y: -8 }}
              animate={{ opacity: 1, scaleY: 1, y: 0 }}
              exit={{ opacity: 0, scaleY: 0.9, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute left-0 right-0 z-40 mt-2 origin-top rounded-2xl border border-border bg-panel p-1 shadow-2xl"
            >
              {options.length > 0 ? (
                options.map((option) => (
                  <button
                    key={option.id}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-text transition hover:bg-accent/10"
                    onClick={() => {
                      onSelect(option.id)
                      setOpen(false)
                    }}
                  >
                    {option.name}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted">No options yet</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function AppShell({
  children,
  onSignout,
  signingOut,
}: {
  children: ReactNode
  onSignout: () => void
  signingOut: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ orgId?: string; projectId?: string }>()
  const [collapsed, setCollapsed] = useState(false)

  const { data: orgs = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['orgs'],
    queryFn: api.orgs.list,
  })

  const activeOrgId = useMemo(() => {
    if (params.orgId) return params.orgId
    const fromPath = location.pathname.match(/^\/orgs\/([^/]+)/)
    if (fromPath) return fromPath[1]
    return orgs[0]?.id
  }, [params.orgId, location.pathname, orgs])

  const { data: projects = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['projects', activeOrgId],
    queryFn: () => api.projects.list(activeOrgId || ''),
    enabled: !!activeOrgId,
  })

  const activeProjectId = useMemo(() => {
    if (params.projectId) return params.projectId
    const fromPath = location.pathname.match(/^\/projects\/([^/]+)/)
    if (fromPath) return fromPath[1]
    return projects[0]?.id
  }, [params.projectId, location.pathname, projects])

  const selectedOrg = orgs.find((org) => org.id === activeOrgId)
  const selectedProject = projects.find((project) => project.id === activeProjectId)

  return (
    <div className="relative min-h-screen overflow-hidden">
      <ThinBackgroundDecoration />
      <div className="relative z-10 flex min-h-screen">
        <motion.aside
          animate={{ width: collapsed ? 88 : 320 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="frosted border-r border-border/90 bg-bg-soft/90 p-4"
        >
          <div className="flex h-full flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/20 text-accent">
                  <SquaresFour size={20} weight={'regular' satisfies IconWeight} />
                </div>
                {!collapsed && <h1 className="font-display text-2xl tracking-tight">LamBase</h1>}
              </div>
              <MotionButton
                className="grid h-8 w-8 place-items-center rounded-xl border border-border text-muted hover:text-text"
                onClick={() => setCollapsed((v) => !v)}
              >
                <CaretDown size={16} weight={'regular' satisfies IconWeight} className={collapsed ? 'rotate-90' : '-rotate-90'} />
              </MotionButton>
            </div>

            {!collapsed && (
              <>
                <Switcher
                  title="Organisation"
                  value={selectedOrg}
                  options={orgs}
                  onSelect={(orgId) => navigate(`/orgs/${orgId}/projects`)}
                  icon={<Buildings size={20} weight={'regular' satisfies IconWeight} />}
                />
                <Switcher
                  title="Project"
                  value={selectedProject}
                  options={projects}
                  onSelect={(projectId) => navigate(`/projects/${projectId}`)}
                  icon={<Folders size={20} weight={'regular' satisfies IconWeight} />}
                />
              </>
            )}

            <nav className="scrollbar-subtle flex-1 space-y-4 overflow-y-auto pr-1">
              {navGroups.map((group) => (
                <div key={group.title} className="space-y-1.5">
                  {!collapsed && <p className="px-2 text-[11px] uppercase tracking-[0.14em] text-muted">{group.title}</p>}
                  {group.items.map((item) => {
                    const path = item.to(activeProjectId)
                    const isDisabled = item.requireProject && !activeProjectId
                    const active = !isDisabled && location.pathname.startsWith(path)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.label}
                        to={isDisabled ? '#' : path}
                        className={[
                          'group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition duration-200',
                          active
                            ? 'border-accent/40 bg-accent/10 text-accent'
                            : 'border-transparent text-muted hover:-translate-y-[1px] hover:bg-panel-soft/70 hover:text-text',
                          isDisabled ? 'pointer-events-none opacity-40' : '',
                        ].join(' ')}
                      >
                        {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-accent" />}
                        <Icon
                          size={20}
                          weight={(active ? 'bold' : 'regular') satisfies IconWeight}
                          className={active ? 'text-accent' : 'text-muted group-hover:text-text'}
                        />
                        {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>

            <footer className="space-y-3 border-t border-border/70 pt-3">
              {!collapsed && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-panel-soft/70 px-3 py-2 text-xs text-muted">
                  <span>LamBase v0.2.0</span>
                  <span className="flex items-center gap-2">
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1.1, repeat: Infinity }}
                      className="h-2.5 w-2.5 rounded-full bg-emerald-400"
                    />
                    Connected
                  </span>
                </div>
              )}
              <MotionButton
                className="w-full rounded-xl border border-border bg-panel-soft px-3 py-2 text-sm font-semibold text-muted hover:text-text"
                onClick={onSignout}
                disabled={signingOut}
              >
                {signingOut ? 'Signing out...' : 'Sign out'}
              </MotionButton>
            </footer>
          </div>
        </motion.aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}

function ThinBackgroundDecoration() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden text-accent/10">
      <motion.div
        animate={{ y: [0, 12, 0], rotate: [0, 2, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-12 top-16"
      >
        <Database size={180} weight={'thin' satisfies IconWeight} />
      </motion.div>
      <motion.div
        animate={{ y: [0, -10, 0], rotate: [0, -2, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -right-6 bottom-10"
      >
        <HardDrives size={220} weight={'thin' satisfies IconWeight} />
      </motion.div>
      <div className="absolute bottom-3 right-4 flex items-center gap-1 text-xs text-muted/90">
        <WifiHigh size={14} weight={'regular' satisfies IconWeight} className="hidden" />
        <WifiSlash size={14} weight={'regular' satisfies IconWeight} className="hidden" />
      </div>
    </div>
  )
}
