import { useState } from 'react'
import { AuthShell } from '../../components/auth/AuthShell'
import { Card } from '../../components/ui/primitives'
import { IconDownload, IconTrash, IconUpload } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { listSessions } from '../../lib/db/repo.sessions'
import { listRoutines } from '../../lib/db/repo.routines'

function Choice({
  icon,
  title,
  hint,
  tone,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  tone?: 'primary' | 'danger'
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="press w-full rounded-2xl border border-line bg-surface p-4 text-left shadow-card disabled:opacity-50"
    >
      <span className="flex items-center gap-2.5">
        <span className={tone === 'danger' ? 'text-down' : tone === 'primary' ? 'text-accent' : 'text-muted'}>
          {icon}
        </span>
        <span className="text-card text-ink">{title}</span>
      </span>
      <span className="mt-1.5 block text-secondary text-muted">{hint}</span>
    </button>
  )
}

export default function MigrateLocalData() {
  const t = useT()
  const { adoptLocal, keepLocalSeparate, discardLocal, busy } = useAuth()
  const [working, setWorking] = useState(false)

  const { data } = useLiveQuery(
    async () => {
      const [sessions, routines] = await Promise.all([listSessions(), listRoutines(true)])
      return { sessions: sessions.length, routines: routines.length }
    },
    ['sessions', 'routines'],
  )

  const count = (data?.sessions ?? 0) + (data?.routines ?? 0)
  const disabled = busy || working
  const run = (fn: () => Promise<void>) => () => {
    setWorking(true)
    void fn().finally(() => setWorking(false))
  }

  return (
    <AuthShell title={t('migrate.title')} subtitle={t('migrate.body')}>
      <Card className="mb-lg p-4">
        <p className="text-metric text-ink">{t('migrate.found', { n: count })}</p>
        <p className="mt-1 text-secondary text-muted">
          {data?.sessions ?? 0} {t('common.workouts')} · {data?.routines ?? 0} {t('nav.routines').toLowerCase()}
        </p>
      </Card>

      <div className="space-y-md">
        <Choice
          icon={<IconUpload size={18} />}
          title={t('migrate.import')}
          hint={t('migrate.importHint')}
          tone="primary"
          disabled={disabled}
          onClick={run(adoptLocal)}
        />
        <Choice
          icon={<IconDownload size={18} />}
          title={t('migrate.separate')}
          hint={t('migrate.separateHint')}
          disabled={disabled}
          onClick={run(keepLocalSeparate)}
        />
        <Choice
          icon={<IconTrash size={18} />}
          title={t('migrate.discard')}
          hint={t('migrate.discardHint')}
          tone="danger"
          disabled={disabled}
          onClick={run(discardLocal)}
        />
      </div>

      {disabled && <p className="mt-lg text-center text-secondary text-muted">{t('common.loading')}</p>}
    </AuthShell>
  )
}
