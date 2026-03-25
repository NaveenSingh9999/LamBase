import { Buildings, PlusCircle } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, MotionButton, PageFrame, Panel } from '../components/ui'
import { api } from '../lib/lambase'

export default function Orgs() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const { data: orgs, isLoading } = useQuery<{ id: string; name: string; createdAt: string }[]>({
    queryKey: ['orgs'],
    queryFn: api.orgs.list,
  })

  const createOrg = useMutation({
    mutationFn: () => api.orgs.create(name.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      setName('')
    },
  })

  return (
    <PageFrame>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Organizations</p>
          <h1 className="font-display text-4xl tracking-tight">Build from a shared workspace</h1>
          <p className="text-sm text-muted">Organizations hold projects, APIs, database instances, and team context.</p>
        </header>

        <Panel>
          <div className="space-y-4 p-5">
            <h2 className="font-display text-2xl">Create organization</h2>
            <div className="flex flex-wrap gap-3">
              <motion.input
                whileFocus={{ scale: 1.01 }}
                transition={{ duration: 0.2 }}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="eg. Acme Labs"
                className="h-12 min-w-[260px] flex-1 rounded-2xl border border-border bg-bg-soft px-4 text-sm outline-none transition duration-200 focus:border-accent focus:shadow-[0_0_0_4px_rgba(190,250,47,0.12)]"
              />
              <MotionButton
                className="h-12 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => createOrg.mutate()}
                disabled={!name.trim() || createOrg.isPending}
              >
                {createOrg.isPending ? 'Creating...' : 'Create org'}
              </MotionButton>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-4 p-5">
            <h2 className="font-display text-2xl">Organizations</h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((key) => (
                  <div key={key} className="h-20 animate-pulse rounded-2xl bg-panel-soft" />
                ))}
              </div>
            ) : orgs && orgs.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {orgs.map((org, index) => (
                  <motion.div
                    key={org.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03, duration: 0.22, ease: 'easeOut' }}
                  >
                    <Link
                      to={`/orgs/${org.id}/projects`}
                      className="group block rounded-2xl border border-border bg-panel-soft/70 p-4 transition hover:-translate-y-[1px] hover:border-accent/50"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent">
                          <Buildings size={20} weight="regular" />
                        </span>
                        <p className="font-display text-2xl">{org.name}</p>
                      </div>
                      <p className="font-mono text-xs text-muted">{org.id}</p>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Buildings size={48} weight="duotone" />}
                title="No organizations yet"
                description="Create your first org to start provisioning projects."
                action={
                  <MotionButton
                    className="h-11 rounded-2xl bg-gradient-to-r from-accent to-[#9fe91f] px-4 text-sm font-semibold text-black"
                    onClick={() => {
                      if (!name.trim()) setName('First Org')
                      createOrg.mutate()
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <PlusCircle size={16} weight="regular" />
                      Create first org
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
