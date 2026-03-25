import { Copy, Eye, EyeSlash, Key, Table } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MotionButton, PageFrame, Panel } from '../components/ui'
import { api } from '../lib/lambase'

export default function ProjectOverview() {
  const { projectId } = useParams<{ projectId: string }>()
  const [copied, setCopied] = useState<string | null>(null)
  const [reveal, setReveal] = useState<Record<string, boolean>>({})

  const { data: project } = useQuery<{ id: string; name: string; dbName: string }>({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  })

  const { data: keys, isLoading } = useQuery<{ keyName: string; keyValue: string }[]>({
    queryKey: ['project-keys', projectId],
    queryFn: () => api.projects.apiKeys(projectId!),
    enabled: !!projectId,
  })

  const copy = async (value: string, keyName: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(keyName)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <PageFrame>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Project</p>
            <h1 className="font-display text-4xl tracking-tight">{project?.name || projectId}</h1>
            <p className="text-sm text-muted">Keys, endpoints, and database access controls.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/projects/${projectId}/tables`} className="rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 py-2 text-sm font-semibold text-black">
              Open table editor
            </Link>
            <Link to={`/projects/${projectId}/sql`} className="rounded-2xl border border-border bg-panel-soft px-4 py-2 text-sm text-muted transition hover:text-text">
              SQL runner
            </Link>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <div className="space-y-2 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Project ID</p>
              <p className="font-mono text-sm text-text">{projectId}</p>
            </div>
          </Panel>
          <Panel>
            <div className="space-y-2 p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Database</p>
              <p className="font-mono text-sm text-text">{project?.dbName || 'Provisioning...'}</p>
            </div>
          </Panel>
        </div>

        <Panel>
          <div className="space-y-4 p-5">
            <h2 className="font-display text-2xl">API keys</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((key) => (
                  <div key={key} className="h-20 animate-pulse rounded-2xl bg-panel-soft" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {keys?.map((key) => {
                  const visible = reveal[key.keyName]
                  return (
                    <motion.div
                      key={key.keyName}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-border bg-panel-soft/70 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs uppercase tracking-[0.12em] text-accent">
                          <Key size={16} weight="regular" />
                          {key.keyName}
                        </span>
                        <span className="text-xs text-muted">JWT</span>
                      </div>

                      <div className="mb-3 rounded-xl border border-border bg-bg-soft p-3">
                        <motion.p
                          animate={{ filter: visible ? 'blur(0px)' : 'blur(4px)' }}
                          transition={{ duration: 0.22 }}
                          className="break-all font-mono text-xs text-text"
                        >
                          {key.keyValue}
                        </motion.p>
                      </div>

                      <div className="flex gap-2">
                        <MotionButton
                          className="h-10 rounded-xl border border-border bg-panel px-3 text-xs text-muted transition hover:text-text"
                          onClick={() => setReveal((state) => ({ ...state, [key.keyName]: !state[key.keyName] }))}
                        >
                          <span className="inline-flex items-center gap-2">
                            {visible ? <EyeSlash size={16} weight="regular" /> : <Eye size={16} weight="regular" />}
                            {visible ? 'Hide' : 'Reveal'}
                          </span>
                        </MotionButton>
                        <MotionButton
                          className="h-10 rounded-xl border border-border bg-panel px-3 text-xs text-muted transition hover:text-text"
                          onClick={() => copy(key.keyValue, key.keyName)}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Copy size={16} weight="regular" />
                            {copied === key.keyName ? 'Copied' : 'Copy'}
                          </span>
                        </MotionButton>
                      </div>
                    </motion.div>
                  )
                })}
                {!keys?.length && <p className="text-sm text-muted">No keys found.</p>}
              </div>
            )}
          </div>
        </Panel>

        <AnimatePresence>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.25 }}
              className="fixed bottom-6 right-6 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-panel"
            >
              <div className="flex items-center gap-2 px-4 py-3 text-sm">
                <Table size={16} weight="regular" className="text-accent" />
                Key copied to clipboard
              </div>
              <motion.div
                initial={{ x: '0%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.4, ease: 'linear' }}
                className="h-1 w-full bg-accent/70"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageFrame>
  )
}
