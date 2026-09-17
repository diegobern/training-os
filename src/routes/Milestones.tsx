import { Page } from '../components/layout/Page'
import { Card, cx } from '../components/ui/primitives'
import { IconMedal } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listMilestones } from '../lib/db/repo.body'
import { listSessions } from '../lib/db/repo.sessions'
import { useApp, useT } from '../store/useApp'
import { fmtDate } from '../lib/dates'

const ALL_KEYS = [
  'first-workout',
  'workouts-10',
  'workouts-50',
  'workouts-100',
  'first-pr',
  'streak-4',
  'volume-100k',
] as const

export default function Milestones() {
  const t = useT()
  const locale = useApp((s) => s.locale)

  const { data } = useLiveQuery(
    async () => {
      const [milestones, sessions] = await Promise.all([listMilestones(), listSessions()])
      return { milestones, sessions }
    },
    ['milestones', 'sessions'],
  )

  const achieved = new Map((data?.milestones ?? []).map((m) => [m.key, m]))

  return (
    <Page title={t('milestones.title')} back>
      <div className="flex flex-col gap-2">
        {ALL_KEYS.map((key) => {
          const m = achieved.get(key)
          return (
            <Card
              key={key}
              className={cx('flex items-center gap-3 px-3.5 py-3', m ? 'border-pr/30' : 'opacity-60')}
            >
              <IconMedal size={22} className={m ? 'text-pr' : 'text-faint'} />
              <div className="min-w-0 flex-1">
                <p className="text-card-sm">{t(`milestones.${key}`)}</p>
                <p className="text-xs text-faint">
                  {m ? fmtDate(m.achievedAt, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : t('milestones.locked')}
                </p>
              </div>
            </Card>
          )
        })}
      </div>
    </Page>
  )
}
