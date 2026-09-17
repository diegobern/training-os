import { Page } from '../components/layout/Page'
import { PRsView } from '../views/PRsView'
import { useT } from '../store/useApp'

export default function PRs() {
  const t = useT()
  return (
    <Page title={t('pr.title')} back>
      <PRsView />
    </Page>
  )
}
