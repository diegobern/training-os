import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button, Card } from '../../components/ui/primitives'
import { IconAlert, IconCheck } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'
import { authErrorKey, resendVerification } from '../../lib/firebase/account'
import { toast } from '../../store/useToast'

/**
 * The verification gate.
 *
 * It is a gate, not a suggestion: there is no way past it other than opening
 * the link. The only other doors are Resend and Sign out, so an address typed
 * wrong is fixed by signing out and registering again rather than by getting
 * in anyway.
 *
 * Three ways it notices that the link was opened, because the link is almost
 * never opened in this tab:
 *
 *   · the button, for someone who is looking at this screen;
 *   · a poll every few seconds, for someone who verified on their phone and
 *     came back to the laptop already open;
 *   · a check when the tab regains focus, which is the common case — verify in
 *     the other tab, switch back, and it has already moved on.
 */

const POLL_MS = 5_000
const RESEND_COOLDOWN_S = 60

export default function VerifyEmail() {
  const t = useT()
  const user = useAuth((s) => s.user)
  const recheck = useAuth((s) => s.recheckVerification)
  const logout = useAuth((s) => s.logout)
  const [busy, setBusy] = useState(false)
  const [stillNot, setStillNot] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  // Guards against two checks overlapping — the poll and the tab regaining
  // focus fire together often enough to matter.
  const checking = useRef(false)

  const check = useCallback(
    async (loud: boolean) => {
      if (checking.current) return false
      checking.current = true
      try {
        const ok = await recheck()
        if (loud) setStillNot(!ok)
        if (ok && loud) toast(t('auth.verifiedOk'), 'success')
        return ok
      } catch {
        return false
      } finally {
        checking.current = false
      }
    },
    [recheck, t],
  )

  // Quietly, in the background. A verified account moves on by itself; an
  // unverified one is told nothing, because nothing has happened.
  useEffect(() => {
    const timer = window.setInterval(() => void check(false), POLL_MS)
    const onFocus = () => {
      if (document.visibilityState === 'visible') void check(false)
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [check])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((n) => n - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  return (
    <AuthShell title={t('auth.verifyTitle')} subtitle={t('auth.verifySub')}>
      <p className="text-card text-ink">{user?.email}</p>
      <p className="mt-2 text-secondary leading-relaxed text-muted">{t('auth.verifyHint')}</p>

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
              await check(true)
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
          disabled={busy || cooldown > 0}
          onClick={async () => {
            setBusy(true)
            try {
              await resendVerification()
              setCooldown(RESEND_COOLDOWN_S)
              toast(t('auth.resent'), 'success')
            } catch (err) {
              toast(t(authErrorKey(err)), 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {cooldown > 0 ? t('auth.resendIn', { s: cooldown }) : t('auth.resend')}
        </Button>
      </div>

      {/* The only other way out. Someone who mistyped their address signs out
          and registers again — they do not get in unverified. */}
      <button
        onClick={() => void logout()}
        className="mt-lg w-full text-secondary text-faint underline-offset-4 hover:underline"
      >
        {t('account.logout')}
      </button>
    </AuthShell>
  )
}
