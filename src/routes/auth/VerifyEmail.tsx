import { useState } from 'react'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button, Card } from '../../components/ui/primitives'
import { IconAlert, IconCheck } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'
import { resendVerification } from '../../lib/firebase/account'
import { toast } from '../../store/useToast'

export default function VerifyEmail() {
  const t = useT()
  const user = useAuth((s) => s.user)
  const recheck = useAuth((s) => s.recheckVerification)
  const skip = useAuth((s) => s.skipVerification)
  const logout = useAuth((s) => s.logout)
  const [busy, setBusy] = useState(false)
  const [stillNot, setStillNot] = useState(false)

  return (
    <AuthShell title={t('auth.verifyTitle')} subtitle={t('auth.verifySub')}>
      <p className="text-card text-ink">{user?.email}</p>

      {stillNot && (
        <Card className="mt-md flex items-start gap-3 border-warn/30 bg-warn/[0.06] p-4">
          <IconAlert size={17} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-secondary text-muted">{t('auth.notVerifiedYet')}</p>
        </Card>
      )}

      <div className="mt-lg space-y-md">
        <Button
          full
          size="lg"
          variant="primary"
          disabled={busy}
          icon={<IconCheck size={17} />}
          onClick={async () => {
            setBusy(true)
            try {
              const ok = await recheck()
              setStillNot(!ok)
              if (ok) toast(t('auth.verifiedOk'), 'success')
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('auth.iVerified')}
        </Button>
        <Button
          full
          size="lg"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await resendVerification()
              toast(t('auth.resent'), 'success')
            } catch {
              toast(t('auth.error.generic'), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('auth.resend')}
        </Button>
      </div>

      {/* Verification gates the flow, but it must never brick an account whose
          mail provider swallows the message. */}
      <button onClick={skip} className="mt-lg w-full text-secondary font-semibold text-muted underline-offset-4 hover:underline">
        {t('auth.continueUnverified')}
      </button>
      <button onClick={() => void logout()} className="mt-md w-full text-secondary text-faint underline-offset-4 hover:underline">
        {t('account.logout')}
      </button>
    </AuthShell>
  )
}
