import { Page } from '../components/layout/Page'
import { CalendarView } from '../views/CalendarView'
import { useT } from '../store/useApp'

export default function CalendarPage() {
  const t = useT()
  return (
    <Page title={t('calendar.title')} back>
      <CalendarView />
    </Page>
  )
}
