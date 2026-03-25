import {
  ArrowsDownUp,
  FloppyDisk,
  Plus,
  Rows,
  Table,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, MotionButton, PageFrame, Panel } from '../components/ui'
import { api } from '../lib/lambase'

type ColumnInfo = {
  name: string
  type: string
  nullable: boolean
  default?: string | null
}

export default function TableEditor() {
  const { projectId, schema, table } = useParams<{ projectId: string; schema: string; table: string }>()
  const queryClient = useQueryClient()

  const [newData, setNewData] = useState('{\n  "name": "row-1"\n}')
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({})
  const [editingCell, setEditingCell] = useState<{ row: number; column: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [sortState, setSortState] = useState<{ column: string; asc: boolean } | null>(null)
  const [sqlOpen, setSqlOpen] = useState(false)
  const [sqlHeight, setSqlHeight] = useState(280)
  const [sqlQuery, setSqlQuery] = useState(`select * from ${schema}.${table} limit 100;`)

  const { data: columns } = useQuery<ColumnInfo[]>({
    queryKey: ['columns', projectId, schema, table],
    queryFn: () => api.projects.columns(projectId!, schema!, table!),
    enabled: !!projectId && !!schema && !!table,
  })

  const { data: rows, isLoading, error } = useQuery<Record<string, unknown>[]>({
    queryKey: ['rows', projectId, schema, table],
    queryFn: () => api.projects.listRows(projectId!, schema!, table!),
    enabled: !!projectId && !!schema && !!table,
  })

  const insertRow = useMutation({
    mutationFn: (data: object) => api.projects.insertRow(projectId!, schema!, table!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rows', projectId, schema, table] })
      setNewData('{\n  "name": "row-1"\n}')
    },
  })

  const updateRow = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.projects.updateRow(projectId!, schema!, table!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rows', projectId, schema, table] })
      setEditingCell(null)
      setEditValue('')
    },
  })

  const deleteRow = useMutation({
    mutationFn: (id: string) => api.projects.deleteRow(projectId!, schema!, table!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rows', projectId, schema, table] }),
  })

  const dropTable = useMutation({
    mutationFn: () => api.projects.dropTable(projectId!, schema!, table!),
    onSuccess: () => {
      window.location.href = `/projects/${projectId}/tables`
    },
  })

  const runSql = useMutation({
    mutationFn: () => api.projects.sql(projectId!, sqlQuery),
  })

  const tableRows = useMemo(() => {
    if (!rows) return []
    if (!sortState) return rows

    return [...rows].sort((a, b) => {
      const left = a[sortState.column]
      const right = b[sortState.column]
      if (left === right) return 0
      if (left === undefined || left === null) return 1
      if (right === undefined || right === null) return -1
      if (sortState.asc) return String(left).localeCompare(String(right))
      return String(right).localeCompare(String(left))
    })
  }, [rows, sortState])

  const allColumns = useMemo(() => {
    if (columns && columns.length > 0) return columns
    if (rows && rows.length > 0) {
      return Object.keys(rows[0]).map((name) => ({ name, type: 'unknown', nullable: true }))
    }
    return []
  }, [columns, rows])

  const beginEdit = (rowIndex: number, column: string, value: unknown) => {
    setEditingCell({ row: rowIndex, column })
    setEditValue(String(value ?? ''))
  }

  const saveEdit = (row: Record<string, unknown>) => {
    if (!editingCell) return
    if (!row.id) return
    updateRow.mutate({ id: String(row.id), data: { [editingCell.column]: editValue } })
  }

  const toggleSort = (column: string) => {
    setSortState((state) => {
      if (!state || state.column !== column) return { column, asc: true }
      return { column, asc: !state.asc }
    })
  }

  const parseAndInsert = () => {
    try {
      const payload = JSON.parse(newData)
      insertRow.mutate(payload)
    } catch {
      // Basic shake animation trigger via class toggle.
      const el = document.getElementById('insert-json')
      if (el) {
        el.classList.remove('animate-[shake_0.4s_ease]')
        void el.offsetWidth
        el.classList.add('animate-[shake_0.4s_ease]')
      }
    }
  }

  if (isLoading) {
    return (
      <PageFrame>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((key) => (
            <div key={key} className="h-16 animate-pulse rounded-2xl bg-panel-soft" />
          ))}
        </div>
      </PageFrame>
    )
  }

  if (error) {
    return (
      <PageFrame>
        <EmptyState
          icon={<WarningCircle size={48} weight="duotone" />}
          title="Could not load this table"
          description="Check if the table exists or refresh your session."
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <div className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Table</p>
            <h1 className="font-display text-4xl tracking-tight">
              <Link to={`/projects/${projectId}/tables`} className="text-muted transition hover:text-text">
                Tables
              </Link>{' '}
              / {table}
            </h1>
            <p className="text-sm text-muted">Schema {schema}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MotionButton
              className="h-11 rounded-2xl border border-danger/40 bg-danger/15 px-4 text-sm font-semibold text-rose-200"
              onClick={() => {
                const button = document.getElementById('drop-table-btn')
                if (button) {
                  button.classList.remove('animate-[shake_0.4s_ease]')
                  void button.offsetWidth
                  button.classList.add('animate-[shake_0.4s_ease]')
                }
                setTimeout(() => {
                  if (confirm('Delete table?')) dropTable.mutate()
                }, 120)
              }}
            >
              <span id="drop-table-btn" className="inline-flex items-center gap-2">
                <Trash size={16} weight="regular" />
                Drop table
              </span>
            </MotionButton>
            <MotionButton
              className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
              onClick={() => setSqlOpen((state) => !state)}
            >
              SQL pane
            </MotionButton>
          </div>
        </header>

        <Panel>
          <div className="space-y-3 p-5">
            <h2 className="font-display text-2xl">Insert row</h2>
            <textarea
              id="insert-json"
              value={newData}
              onChange={(event) => setNewData(event.target.value)}
              className="h-36 w-full rounded-2xl border border-border bg-bg-soft p-3 font-mono text-xs outline-none transition focus:border-accent"
            />
            <MotionButton
              className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
              onClick={parseAndInsert}
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={16} weight="regular" />
                Insert row
              </span>
            </MotionButton>
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="overflow-auto scrollbar-subtle">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 bg-panel">
                <tr>
                  <th className="w-14 px-3 py-3 text-left text-xs text-muted">Sel</th>
                  {allColumns.map((col) => (
                    <th key={col.name} className="px-3 py-3 text-left text-xs">
                      <button
                        onClick={() => toggleSort(col.name)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel-soft/70 px-2 py-1 text-muted transition hover:text-text"
                      >
                        <span className="font-semibold text-text">{col.name}</span>
                        <span className="rounded-full bg-bg-soft px-2 py-0.5 font-mono text-[10px] text-muted">{col.type}</span>
                        <motion.span animate={{ rotate: sortState?.column === col.name && !sortState.asc ? 180 : 0 }}>
                          <ArrowsDownUp size={14} weight="regular" />
                        </motion.span>
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-xs text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rowIndex) => {
                  const rowKey = String(row.id ?? rowIndex)
                  const selected = !!selectedRows[rowKey]
                  return (
                    <motion.tr
                      key={rowKey}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: rowIndex * 0.03, duration: 0.18 }}
                      className={[
                        rowIndex % 2 === 0 ? 'bg-panel-soft/35' : 'bg-panel-soft/60',
                        selected ? 'bg-accent/10' : '',
                      ].join(' ')}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setSelectedRows((state) => ({
                              ...state,
                              [rowKey]: !state[rowKey],
                            }))
                          }
                          className="h-4 w-4 rounded-lg border border-border bg-bg-soft"
                        />
                      </td>
                      {allColumns.map((col) => {
                        const editing = editingCell?.row === rowIndex && editingCell.column === col.name
                        return (
                          <td
                            key={col.name}
                            className="max-w-[280px] px-3 py-2 font-mono text-xs text-text"
                            onDoubleClick={() => beginEdit(rowIndex, col.name, row[col.name])}
                          >
                            {editing ? (
                              <motion.input
                                autoFocus
                                value={editValue}
                                onChange={(event) => setEditValue(event.target.value)}
                                onBlur={() => saveEdit(row)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') saveEdit(row)
                                  if (event.key === 'Escape') setEditingCell(null)
                                }}
                                className="h-9 w-full rounded-xl border border-accent bg-bg-soft px-2 text-xs outline-none shadow-[0_0_0_3px_rgba(190,250,47,0.12)]"
                              />
                            ) : (
                              <span className="line-clamp-2">{String(row[col.name] ?? '')}</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2">
                        {row.id ? (
                          <MotionButton
                            className="h-8 rounded-xl border border-border bg-panel px-2 text-xs text-danger"
                            onClick={() => deleteRow.mutate(String(row.id))}
                          >
                            Delete
                          </MotionButton>
                        ) : (
                          <span className="text-xs text-muted">n/a</span>
                        )}
                      </td>
                    </motion.tr>
                  )
                })}

                <tr className="bg-accent/7">
                  <td className="px-3 py-3" />
                  <td colSpan={Math.max(2, allColumns.length)} className="px-3 py-3 text-sm text-muted">
                    <motion.span
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.3, repeat: Infinity }}
                      className="inline-flex items-center gap-2"
                    >
                      <Plus size={16} weight="regular" className="text-accent" />
                      Add new row at the bottom
                    </motion.span>
                  </td>
                </tr>
              </tbody>
            </table>

            {tableRows.length === 0 && (
              <div className="p-5">
                <EmptyState
                  icon={<Rows size={48} weight="duotone" />}
                  title="No rows yet"
                  description="Insert your first row to start editing inline."
                />
              </div>
            )}
          </div>
        </Panel>
      </div>

      <AnimatePresence>
        {sqlOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            style={{ height: sqlHeight }}
            className="fixed bottom-4 left-[max(1rem,88px)] right-4 z-50 overflow-hidden rounded-3xl border border-border bg-panel/95 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
          >
            <div
              className="h-6 cursor-row-resize border-b border-border bg-panel-soft"
              onMouseDown={(event) => {
                const startY = event.clientY
                const startHeight = sqlHeight
                const onMove = (moveEvent: MouseEvent) => {
                  const next = startHeight - (moveEvent.clientY - startY)
                  setSqlHeight(Math.max(200, Math.min(520, next)))
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            />
            <div className="grid h-[calc(100%-24px)] grid-cols-1 gap-3 p-4 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-3">
                <h3 className="font-display text-xl">SQL editor</h3>
                <textarea
                  value={sqlQuery}
                  onChange={(event) => setSqlQuery(event.target.value)}
                  className="h-[calc(100%-80px)] min-h-36 w-full rounded-2xl border border-border bg-bg-soft p-3 font-mono text-xs outline-none transition focus:border-accent"
                />
                <MotionButton
                  className="h-10 rounded-xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
                  onClick={() => runSql.mutate()}
                >
                  <span className="inline-flex items-center gap-2">
                    <Table size={16} weight="regular" />
                    Run query
                  </span>
                </MotionButton>
              </div>
              <div className="space-y-3 overflow-hidden rounded-2xl border border-border bg-bg-soft p-3">
                <h4 className="text-sm font-semibold text-muted">Result</h4>
                <pre className="scrollbar-subtle h-[calc(100%-26px)] overflow-auto whitespace-pre-wrap font-mono text-xs text-text">
                  {runSql.data ? JSON.stringify(runSql.data, null, 2) : runSql.isPending ? 'Running...' : '{}'}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageFrame>
  )
}
