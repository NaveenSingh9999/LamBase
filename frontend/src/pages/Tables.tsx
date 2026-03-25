import { Database, PlusCircle, Table } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, MotionButton, PageFrame, Panel } from '../components/ui'
import { api } from '../lib/lambase'

const defaultColumns = [
  { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
  { name: 'created_at', type: 'datetime', default: 'now()' },
  { name: 'name', type: 'text' },
]

export default function Tables() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [newTableName, setNewTableName] = useState('')
  const [creating, setCreating] = useState(false)
  const [schema, setSchema] = useState('public')

  const { data: schemas } = useQuery<string[]>({
    queryKey: ['schemas', projectId],
    queryFn: () => api.projects.schemas(projectId!),
    enabled: !!projectId,
  })

  useEffect(() => {
    if (!schemas || schemas.length === 0) return
    if (!schemas.includes(schema)) setSchema(schemas[0])
  }, [schema, schemas])

  const { data: tables, isLoading } = useQuery<string[]>({
    queryKey: ['tables', projectId, schema],
    queryFn: () => api.projects.tables(projectId!, schema),
    enabled: !!projectId && !!schema,
  })

  const createTable = useMutation({
    mutationFn: () => api.projects.createTable(projectId!, schema, newTableName, defaultColumns),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', projectId, schema] })
      setCreating(false)
      setNewTableName('')
    },
  })

  return (
    <PageFrame>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Database</p>
            <h1 className="font-display text-4xl tracking-tight">Table Editor</h1>
            <p className="text-sm text-muted">Explore schemas and manage data with a fast grid workflow.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/projects/${projectId}`} className="rounded-2xl border border-border bg-panel-soft px-4 py-2 text-sm text-muted transition hover:text-text">
              Project overview
            </Link>
            <Link to={`/projects/${projectId}/sql`} className="rounded-2xl border border-border bg-panel-soft px-4 py-2 text-sm text-muted transition hover:text-text">
              SQL runner
            </Link>
          </div>
        </header>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <label className="text-xs uppercase tracking-[0.12em] text-muted">Schema</label>
              <select
                value={schema}
                onChange={(event) => setSchema(event.target.value)}
                className="h-11 min-w-[170px] rounded-2xl border border-border bg-bg-soft px-3 text-sm outline-none transition focus:border-accent"
              >
                {(schemas || ['public']).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <MotionButton
              className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
              onClick={() => setCreating((state) => !state)}
            >
              <span className="inline-flex items-center gap-2">
                <PlusCircle size={16} weight="regular" />
                {creating ? 'Close' : 'New table'}
              </span>
            </MotionButton>
          </div>
        </Panel>

        {creating && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Panel>
              <div className="space-y-4 p-5">
                <h2 className="font-display text-2xl">Create table in {schema}</h2>
                <div className="flex flex-wrap gap-3">
                  <input
                    value={newTableName}
                    onChange={(event) => setNewTableName(event.target.value)}
                    className="h-12 min-w-[260px] flex-1 rounded-2xl border border-border bg-bg-soft px-4 text-sm outline-none transition focus:border-accent"
                    placeholder="eg. customers"
                  />
                  <MotionButton
                    className="h-12 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-5 text-sm font-semibold text-black disabled:opacity-50"
                    onClick={() => createTable.mutate()}
                    disabled={!newTableName.trim() || createTable.isPending}
                  >
                    {createTable.isPending ? 'Creating...' : 'Create'}
                  </MotionButton>
                </div>
                <p className="text-xs text-muted">Default schema includes id, created_at, and name to speed up prototyping.</p>
              </div>
            </Panel>
          </motion.div>
        )}

        <Panel>
          <div className="space-y-4 p-5">
            <h2 className="font-display text-2xl">Tables in {schema}</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <div key={key} className="h-16 animate-pulse rounded-2xl bg-panel-soft" />
                ))}
              </div>
            ) : tables && tables.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {tables.map((table, index) => (
                  <motion.div
                    key={table}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.22, ease: 'easeOut' }}
                  >
                    <Link
                      to={`/projects/${projectId}/tables/${schema}/${table}`}
                      className="group block rounded-2xl border border-border bg-panel-soft/70 p-4 transition hover:-translate-y-[1px] hover:border-accent/50"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
                          <Table size={20} weight="regular" />
                        </span>
                        <p className="font-display text-2xl">{table}</p>
                      </div>
                      <p className="font-mono text-xs text-muted">{schema}.{table}</p>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Database size={48} weight="duotone" />}
                title="No tables in this schema"
                description="Create your first table and start inserting rows instantly."
                action={
                  <MotionButton
                    className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
                    onClick={() => setCreating(true)}
                  >
                    Create table
                  </MotionButton>
                }
              />
            )}
          </div>
        </Panel>
      </div>
    </PageFrame>
  )
}
