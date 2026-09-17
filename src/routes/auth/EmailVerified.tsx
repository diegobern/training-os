import { useEffect, useState } from 'react'
import { BrandMark } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui/primitives'
import { IconAlert, IconCheck } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'

type Phase = 'checking' | 'ok' | 'fail'

/**
 * Where the verification link lands.
 *
 * It renders outside the auth gate on purpose. People open these links in
 * whatever browser their mail app hands them, usually one with no session at
 * all — and greeting them with a sign-up screen after they clicked "verify"
 * would read as though it had failed.
 *
 * Two arrivals are possible and both end here:
 *   · Firebase's own handler applied the code and redirected here. There is no
 *     `oobCode` in the URL and nothing left to do but say so.
 *   · A custom action URL sent the link straight here, code and all, so the
 *     page applies it itself.
 */
export default function EmailVerified() {
  const t = useT()
  const [phase, setPhase] = useState<Phase>('checking')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oobCode = params.get('oobCode')

    // Nothing to apply: Firebase already did it before redirecting here.
    if (!oobCode) {
      setPhase('ok')
      return
    }

    let alive = true
    void (async () => {
      try {
        const { applyVerificationCode } = await import('../../lib/firebase/account')
        await applyVerificationCode(oobCode)
        if (alive) setPhase('ok')
      } catch {
        // An already-used code lands here too. We cannot tell that apart from
        // an expired one without more state than this page has, so the message
        // covers both and points at the one action that fixes either.
        if (alive) setPhase('fail')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const failed = phase === 'fail'

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <BrandMark />
        </div>

        <div className="mt-xl flex justify-center">
          {phase === 'checking' ? (
            <span className="h-16 w-16 animate-pulse rounded-full bg-accent/15" />
          ) : failed ? (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-warn/12">
              <IconAlert size={30} className="text-warn" />
            </span>
          ) : (
            <span className="anim-pop flex h-16 w-16 items-center justify-center rounded-full bg-brand shadow-glow">
              <IconCheck size={32} strokeWidth={2.4} className="text-brand-ink" />
            </span>
          )}
        </div>

        <h1 className="mt-lg text-page text-ink">
          {phase === 'checking' ? t('verified.checking') : failed ? t('verified.failTitle') : t('verified.title')}
        </h1>

        {phase !== 'checking' && (
          <p className="mt-md text-page-sub text-muted">{failed ? t('verified.failBody') : t('verified.body')}</p>
        )}

        {phase !== 'checking' && (
          <Button
            full
            size="xl"
            variant={failed ? 'secondary' : 'primary'}
            className="mt-xl"
            // A hard navigation, not a client-side route change: this page is
            // usually opened in a fresh tab with no app state behind it.
            onClick={() => window.location.replace('/')}
          >
            {failed ? t('verified.back') : t('verified.open')}
          </Button>
        )}
      </div>
    </div>
  )
}
