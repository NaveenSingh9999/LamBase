import { Folders, PlusCircle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, MotionButton, PageFrame, Panel } from '../components/ui'
import { api } from '../lib/lambase'

export default function Projects() {
  const { orgId } = useParams<{ orgId: string }>()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const { data: projects, isLoading } = useQuery<{ id: string; name: string; dbName: string }[]>({
    queryKey: ['projects', orgId],
    queryFn: () => api.projects.list(orgId!),
    enabled: !!orgId,
  })

  const createProject = useMutation({
    mutationFn: () => api.projects.create(orgId!, name.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', orgId] })
      setName('')
    },
  })

  return (
    <PageFrame>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Projects</p>
            <h1 className="font-display text-4xl tracking-tight">Projects in {orgId}</h1>
            <p className="text-sm text-muted">Each project ships with isolated Postgres and dashboard APIs.</p>
          </div>
          <Link to="/orgs" className="rounded-2xl border border-border bg-panel-soft px-4 py-2 text-sm text-muted transition hover:text-text">
            Back to orgs
          </Link>
        </header>

        <Panel>
          <div className="space-y-4 p-5">
            <h2 className="font-display text-2xl">Create project</h2>
            <div className="flex flex-wrap gap-3">
              <motion.input
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.2 }}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="eg. checkout-service"
                className="h-12 min-w-[260px] flex-1 rounded-2xl border border-border bg-bg-soft px-4 text-sm outline-none transition duration-200 focus:border-accent focus:shadow-[0_0_0_4px_rgba(190,250,47,0.12)]"
              />
              <MotionButton
                className="h-12 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => createProject.mutate()}
                disabled={!name.trim() || createProject.isPending}
              >
                {createProject.isPending ? 'Provisioning...' : 'Create project'}
              </MotionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-4 p-5">
            <h2 className="font-display text-2xl">Projects</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <div key={key} className="h-20 animate-pulse rounded-2xl bg-panel-soft" />
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project, index) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.22, ease: 'easeOut' }}
                  >
                    <Link
                      to={`/projects/${project.id}`}
                      className="group block rounded-2xl border border-border bg-panel-soft/70 p-4 transition hover:-translate-y-[1px] hover:border-accent/50"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
                          <Folders size={20} weight="regular" />
                        </span>
                        <p className="font-display text-2xl">{project.name}</p>
                      </div>
                      <p className="font-mono text-xs text-muted">{project.dbName}</p>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Folders size={48} weight="duotone" />}
                title="No projects yet"
                description="Provision your first project to unlock table editor and APIs."
                action={
                  <MotionButton
                    className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
                    onClick={() => {
                      if (!name.trim()) setName('first-project')
                      createProject.mutate()
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PlusCircle size={16} weight="regular" />
                      Create first project
                    </span>
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
