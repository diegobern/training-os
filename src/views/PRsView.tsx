import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Chip, EmptyState, SectionTitle } from '../components/ui/primitives'
import { IconTrophy } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listPRs } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { fmtDate } from '../lib/dates'
import { fmtVolumeFull, fmtWeight, trimNum } from '../lib/format'
import type { PRType } from '../lib/db/schema'

const TYPES: (PRType | 'all')[] = ['all', 'weight', 'reps', 'e1rm', 'volume']

export function PRsView() {
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()
  const [type, setType] = useState<PRType | 'all'>('all')

  const { data } = useLiveQuery(() => listPRs(), ['personalRecords'])
  const prs = useMemo(() => (data ?? []).filter((p) => (type === 'all' ? true : p.type === type)), [data, type])

  return (
    <>
      <div className="scroll-x mb-4">
        {TYPES.map((x) => (
          <Chip key={x} active={type === x} onClick={() => setType(x)}>
            {x === 'all' ? t('common.all') : t(`pr.${x}`)}
          </Chip>
        ))}
      </div>

      {prs.length === 0 ? (
        <EmptyState icon={<IconTrophy size={26} />} title={t('pr.empty')} body={t('pr.emptyBody')} />
      ) : (
        <>
          <SectionTitle>{prs.length}</SectionTitle>
          <div className="flex flex-col gap-2">
            {prs.map((pr) => (
              <button key={pr.id} onClick={() => navigate(`/progress/${pr.exerciseId}`)} className="press text-left">
                <Card className="flex items-center gap-3 px-3.5 py-3">
                  <IconTrophy size={18} className="shrink-0 text-pr" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-card-sm">{pr.exerciseName}</p>
                    <p className="text-xs text-faint">
                      {t(`pr.${pr.type}`)} · {fmtDate(pr.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-bold">
                      {pr.type === 'reps'
                        ? `${trimNum(pr.value)} ${t('common.reps')}`
                        : pr.type === 'volume'
                          ? fmtVolumeFull(pr.value, settings.units)
                          : fmtWeight(pr.value, settings.units)}
                      {pr.type === 'weight' && pr.reps ? ` × ${pr.reps}` : ''}
                    </p>
                    {pr.delta !== null && (
                      <p className="tnum text-caption font-semibold text-up">
                        +{pr.type === 'reps' ? trimNum(pr.delta) : fmtWeight(pr.delta, settings.units)}
                      </p>
                    )}
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
