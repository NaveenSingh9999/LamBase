import { TerminalWindow } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { MotionButton, PageFrame, Panel } from '../components/ui'
import { api } from '../lib/lambase'

export default function SqlRunner() {
  const { projectId } = useParams<{ projectId: string }>()
  const [query, setQuery] = useState('select now();')

  const runSql = useMutation({
    mutationFn: () => api.projects.sql(projectId!, query),
  })

  return (
    <PageFrame>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Observe</p>
            <h1 className="font-display text-4xl tracking-tight">SQL Runner</h1>
            <p className="text-sm text-muted">Run direct SQL with instant feedback and clean output.</p>
          </div>
          <Link to={`/projects/${projectId}`} className="rounded-2xl border border-border bg-panel-soft px-4 py-2 text-sm text-muted transition hover:text-text">
            Back to project
          </Link>
        </header>

        <Panel>
          <div className="space-y-4 p-5">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-56 w-full rounded-2xl border border-border bg-bg-soft p-4 font-mono text-xs outline-none transition focus:border-accent"
            />
            <div className="flex gap-2">
              <MotionButton
                className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
                onClick={() => runSql.mutate()}
                disabled={runSql.isPending}
              >
                <span className="inline-flex items-center gap-2">
                  <TerminalWindow size={16} weight="regular" />
                  {runSql.isPending ? 'Running...' : 'Run query'}
                </span>
              </MotionButton>
              <Link to={`/projects/${projectId}/tables`} className="rounded-2xl border border-border bg-panel-soft px-4 py-2 text-sm text-muted transition hover:text-text">
                Table editor
              </Link>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-3 p-5">
            <h2 className="font-display text-2xl">Result</h2>
            <pre className="max-h-[420px] overflow-auto rounded-2xl border border-border bg-bg-soft p-4 font-mono text-xs text-text">
              {runSql.isPending
                ? 'Executing query...'
                : runSql.error
                  ? runSql.error instanceof Error
                    ? runSql.error.message
                    : 'Query failed'
                  : runSql.data
                    ? JSON.stringify(runSql.data, null, 2)
                    : '{}'}
            </pre>
          </div>
        </Panel>
      </div>
    </PageFrame>
  )
}
