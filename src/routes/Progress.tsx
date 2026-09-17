import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { ViewSelector, type ViewOption } from '../components/progress/ViewSelector'
import { IconBody, IconCalendar, IconChart, IconRuler, IconTrophy } from '../components/ui/Icon'
import { ProgressOverview } from '../views/ProgressOverview'
import { StatsView } from '../views/StatsView'
import { PRsView } from '../views/PRsView'
import { CalendarView } from '../views/CalendarView'
import { BodyView } from '../views/BodyView'
import { useT } from '../store/useApp'

type View = 'overview' | 'statistics' | 'records' | 'calendar' | 'body' | 'measurements'

const VIEWS: ViewOption<View>[] = [
  { value: 'overview', labelKey: 'progress.view.overview', icon: <IconChart size={20} /> },
  { value: 'statistics', labelKey: 'progress.view.statistics', icon: <IconChart size={20} /> },
  { value: 'records', labelKey: 'progress.view.records', icon: <IconTrophy size={20} /> },
  { value: 'calendar', labelKey: 'progress.view.calendar', icon: <IconCalendar size={20} /> },
  { value: 'body', labelKey: 'progress.view.body', icon: <IconBody size={20} /> },
  { value: 'measurements', labelKey: 'progress.view.measurements', icon: <IconRuler size={20} /> },
]

const isView = (v: string | null): v is View => VIEWS.some((o) => o.value === v)

export default function Progress() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(isView(params.get('view')) ? (params.get('view') as View) : 'overview')

  // The chosen view lives in the URL, so it survives a reload and can be linked to.
  useEffect(() => {
    const current = params.get('view')
    if (view === 'overview' && !current) return
    if (current === view) return
    const next = new URLSearchParams(params)
    if (view === 'overview') next.delete('view')
    else next.set('view', view)
    setParams(next, { replace: true })
  }, [view, params, setParams])

  return (
    <Page title={t('progress.title')} subtitle={t('progress.subtitle')}>
      <div className="mb-lg">
        <ViewSelector value={view} onChange={setView} options={VIEWS} label={t('progress.view')} />
      </div>

      {view === 'overview' && <ProgressOverview />}
      {view === 'statistics' && <StatsView />}
      {view === 'records' && <PRsView />}
      {view === 'calendar' && <CalendarView />}
      {view === 'body' && <BodyView initialTab="weight" />}
      {view === 'measurements' && <BodyView initialTab="measurements" />}
    </Page>
  )
}
