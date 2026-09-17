import { useState } from 'react'
import { AuthError, AuthShell } from '../../components/auth/AuthShell'
import { Button, IconButton, TextField } from '../../components/ui/primitives'
import { IconChevronLeft } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { authErrorKey, signIn } from '../../lib/firebase/account'

export default function Login({
  onBack,
  onSignUp,
  onForgot,
}: {
  onBack: () => void
  onSignUp: () => void
  onForgot: () => void
}) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(t(authErrorKey(err)))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.welcomeBack')}
      subtitle={t('auth.welcomeBackSub')}
      back={
        <IconButton label={t('common.back')} onClick={onBack}>
          <IconChevronLeft size={22} />
        </IconButton>
      }
      footer={
        <div className="space-y-md">
          <Button full size="xl" variant="primary" disabled={busy || !email.trim() || !password} onClick={submit}>
            {busy ? t('common.loading') : t('auth.logInCta')}
          </Button>
          <p className="text-center text-secondary text-muted">
            {t('auth.noAccount')}{' '}
            <button onClick={onSignUp} className="font-semibold text-accent underline-offset-4 hover:underline">
              {t('auth.signUpCta')}
            </button>
          </p>
        </div>
      }
    >
      <AuthError message={error} />
      <form
        className="space-y-md"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <TextField
          label={t('auth.email')}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          onClick={onForgot}
          className="text-secondary font-semibold text-accent underline-offset-4 hover:underline"
        >
          {t('auth.forgot')}
        </button>
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
      </form>
    </AuthShell>
  )
}
