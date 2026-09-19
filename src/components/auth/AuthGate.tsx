import { lazy, Suspense, useEffect, useState } from 'react'
import { useAuth } from '../../store/useAuth'
import { useApp, useT } from '../../store/useApp'
import { flag } from '../../lib/flags'
import { ONBOARDING_VERSION } from '../../lib/training/onboarding-version'
import { BrandMark } from './AuthShell'
import { Button, Skeleton } from '../ui/primitives'
import { IconAlert } from '../ui/Icon'
import { AuthStack } from './AuthStack'
import { dismissBootMark } from '../../lib/bootmark'

const Welcome = lazy(() => import('../../routes/auth/Welcome'))
const SignUp = lazy(() => import('../../routes/auth/SignUp'))
const Login = lazy(() => import('../../routes/auth/Login'))
const ForgotPassword = lazy(() => import('../../routes/auth/ForgotPassword'))
const UsernameSetup = lazy(() => import('../../routes/auth/UsernameSetup'))
const Onboarding = lazy(() => import('../../routes/auth/Onboarding'))
const OnboardingTopUp = lazy(() => import('../../routes/auth/OnboardingTopUp'))
const MigrateLocalData = lazy(() => import('../../routes/auth/MigrateLocalData'))

type SignedOutView = 'welcome' | 'signup' | 'login' | 'forgot'

/**
 * How far in each screen sits. The stack pushes up towards a deeper number
 * and comes back down towards a shallower one, so "back" always reverses the
 * move that got you there — including login -> sign up -> login.
 */
const DEPTH: Record<SignedOutView, number> = { welcome: 0, login: 1, signup: 2, forgot: 3 }

/** Shown while Firebase resolves the session. Never a flash of the wrong screen. */
function AuthChecking() {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-lg bg-bg px-6">
      <BrandMark />
      <div className="w-full max-w-xs space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <p className="text-secondary text-faint">{t('auth.checking')}</p>
    </div>
  )
}

function Loading() {
  return <div className="min-h-dvh bg-bg" />
}

/** Signed in but Firestore is unreachable. The session is not thrown away. */
function ConnectionError() {
  const t = useT()
  const retry = useAuth((s) => s.resolve)
  const logout = useAuth((s) => s.logout)
  const message = useAuth((s) => s.error)
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-md bg-bg px-8 text-center">
      <IconAlert size={28} className="text-warn" />
      <h1 className="text-card text-ink">{t('auth.error.network')}</h1>
      {message && <p className="max-w-sm break-words text-caption text-faint">{message}</p>}
      <Button variant="primary" onClick={() => void retry()}>
        {t('common.retry')}
      </Button>
      <button onClick={() => void logout()} className="text-secondary text-faint underline-offset-4 hover:underline">
        {t('account.logout')}
      </button>
    </div>
  )
}

/**
 * Decides whether the app is reachable at all. Private data is never rendered
 * before Firebase has confirmed who is asking.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const phase = useAuth((s) => s.phase)
  const onboardingMode = useAuth((s) => s.onboardingMode)
  const localOnboardingVersion = useApp((s) => s.settings.onboardingVersion ?? 0)
  const needsLocalOnboarding = flag('newOnboarding') && localOnboardingVersion < ONBOARDING_VERSION
  const init = useAuth((s) => s.init)
  const [view, setView] = useState<SignedOutView>('welcome')

  useEffect(() => {
    void init()
  }, [init])

  // This is the real end of the launch: the session is resolved and whatever
  // renders next is a screen, not a placeholder. Holding the splash until here
  // is what keeps the launch to one dissolve instead of two.
  useEffect(() => {
    if (phase !== 'checking') dismissBootMark()
  }, [phase])

  // Warm the two screens the welcome buttons lead to. Without this the first
  // press animates a blank pane in while its chunk downloads, and the whole
  // point of the transition is that the next screen is already there.
  //
  // Started immediately, not on a timer: these are a few KB each, they are the
  // only thing the user can do from this screen, and a delay here was the
  // whole cost of the first press on a slow connection.
  useEffect(() => {
    if (phase !== 'signed-out' || view !== 'welcome') return
    void import('../../routes/auth/SignUp')
    void import('../../routes/auth/Login')
  }, [phase, view])

  // Onboarding is not an account feature. Without this, a local-only install —
  // or any launch before Firebase is configured — had no questionnaire, and so
  // no personalization at all. The local settings are what decide.
  if (phase === 'local-only' && needsLocalOnboarding) {
    return (
      <Suspense fallback={<Loading />}>
        <Onboarding />
      </Suspense>
    )
  }
  if (phase === 'local-only' || phase === 'ready') return <>{children}</>
  if (phase === 'checking') return <AuthChecking />

  // Each pane carries its own Suspense boundary. With a single boundary around
  // the whole stack, a chunk that has not arrived yet would suspend the stack
  // itself — unmounting the screen we are animating away from, mid-animation.
  const renderSignedOut = (v: SignedOutView) => (
    <Suspense fallback={<Loading />}>{signedOutScreen(v)}</Suspense>
  )

  const signedOutScreen = (v: SignedOutView) => {
    switch (v) {
      case 'welcome':
        return <Welcome onSignUp={() => setView('signup')} onLogIn={() => setView('login')} />
      case 'signup':
        return <SignUp onBack={() => setView('welcome')} onLogIn={() => setView('login')} />
      case 'login':
        return (
          <Login
            onBack={() => setView('welcome')}
            onSignUp={() => setView('signup')}
            onForgot={() => setView('forgot')}
          />
        )
      case 'forgot':
        return <ForgotPassword onBack={() => setView('login')} />
    }
  }

  return (
    <Suspense fallback={<Loading />}>
      {phase === 'signed-out' && (
        <AuthStack view={view} depth={(v) => DEPTH[v]} render={renderSignedOut} />
      )}
      {phase === 'connection-error' && <ConnectionError />}
      {phase === 'migrating' && <MigrateLocalData />}
      {phase === 'needs-username' && <UsernameSetup />}
      {phase === 'onboarding' && (onboardingMode === 'update' ? <OnboardingTopUp /> : <Onboarding />)}
    </Suspense>
  )
}
