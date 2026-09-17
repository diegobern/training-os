import { Page } from '../components/layout/Page'
import { StatsView } from '../views/StatsView'
import { useT } from '../store/useApp'

export default function Stats() {
  const t = useT()
  return (
    <Page title={t('stats.title')} subtitle={t('progress.subtitle')} back>
      <StatsView />
    </Page>
  )
}
