import { AuthShell } from '../../components/auth/AuthShell'
import { Button, Card } from '../../components/ui/primitives'
import { IconCheck } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'

/**
 * The offer shown to an account that finished an older questionnaire.
 *
 * It is an offer, not a gate. Their routines, history, records, bodyweight and
 * settings are all exactly where they left them, and nothing in the app is
 * withheld until they answer — which is why the reassurance is the first thing
 * on the screen rather than a footnote. "Not now" goes straight to the app and
 * is remembered on this device.
 */
export default function OnboardingTopUp() {
  const t = useT()
  const accept = useAuth((s) => s.acceptOnboardingTopUp)
  const decline = useAuth((s) => s.declineOnboardingTopUp)

  return (
    <AuthShell title={t('ob.update.title')} subtitle={t('ob.update.sub')}>
      <Card className="flex items-start gap-3 border-accent/30 bg-accent/[0.06] p-4">
        <IconCheck size={17} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-secondary text-muted">{t('ob.update.keeps')}</p>
      </Card>

      <div className="mt-lg space-y-md">
        <Button full size="xl" variant="primary" onClick={accept}>
          {t('ob.update.start')}
        </Button>
        <button
          onClick={() => void decline()}
          className="w-full text-secondary font-semibold text-muted underline-offset-4 hover:underline"
        >
          {t('ob.update.later')}
        </button>
      </div>
    </AuthShell>
  )
}
