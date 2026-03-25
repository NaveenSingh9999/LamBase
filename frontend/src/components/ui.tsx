import { motion } from 'framer-motion'
import { ReactNode } from 'react'

export function MotionButton({
  children,
  className,
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode
  className: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.button>
  )
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">{children}</div>
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-panel/90 frosted shadow-[0_20px_50px_rgba(0,0,0,0.35)] ${className}`}>
      {children}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-panel-soft/70 px-6 py-14 text-center">
      <motion.div
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/10 text-accent"
      >
        {icon}
      </motion.div>
      <div className="space-y-1">
        <h3 className="font-display text-2xl tracking-tight">{title}</h3>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}

export const pageMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -18 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
}
