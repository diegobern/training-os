import { Button } from '../../components/ui/primitives'
import { BrandMark } from '../../components/auth/AuthShell'
import { LogoTotem } from '../../components/brand/LogoTotem'
import { useT } from '../../store/useApp'

/**
 * Pulls the next screen's chunk down the moment a finger touches the button.
 * A tap takes 80-150ms between pointerdown and click; on a slow connection
 * that head start is free, and on a fast one the chunk is already in flight
 * before the transition begins.
 */
const warm = {
  signup: () => void import('./SignUp'),
  login: () => void import('./Login'),
}

export default function Welcome({ onSignUp, onLogIn }: { onSignUp: () => void; onLogIn: () => void }) {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between px-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 3rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
        }}
      >
        <div>
          <BrandMark />
          <h1 className="mt-xl text-hero text-ink">
            {t('auth.tagline1')}
            <br />
            {t('auth.tagline2')}
          </h1>
          <p className="mt-lg max-w-xs text-page-sub text-muted">{t('auth.tagline3')}</p>
        </div>

        {/* The empty middle of this screen was doing nothing. It is now the
            only place in the app where the brand gets to be an object.

            Sized off viewport HEIGHT, not width: on a short screen the object
            would otherwise push CREATE ACCOUNT below the fold, and no amount of
            rendering is worth hiding the one button this screen exists for.
            Under 700px tall it simply steps aside. */}
        <LogoTotem className="my-md shrink-0 h-[min(30vh,14rem)] [@media(min-height:820px)]:my-lg [@media(min-height:820px)]:h-[min(42vh,21rem)]" />

        <div className="space-y-md">
          <Button full size="xl" variant="primary" onPointerDown={warm.signup} onClick={onSignUp}>
            {t('auth.createAccount')}
          </Button>
          <p className="text-center text-secondary text-muted">
            {t('auth.haveAccount')}{' '}
            <button onPointerDown={warm.login} onClick={onLogIn} className="font-semibold text-accent underline-offset-4 hover:underline">
              {t('auth.logIn')}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
