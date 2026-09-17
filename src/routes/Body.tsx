import { Page } from '../components/layout/Page'
import { BodyView } from '../views/BodyView'
import { useT } from '../store/useApp'

export default function Body() {
  const t = useT()
  return (
    <Page title={t('body.title')} back>
      <BodyView />
    </Page>
  )
}
