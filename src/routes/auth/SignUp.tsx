import { useState } from 'react'
import { AuthError, AuthShell } from '../../components/auth/AuthShell'
import { PasswordRules } from '../../components/auth/PasswordRules'
import { Button, IconButton, TextField } from '../../components/ui/primitives'
import { IconChevronLeft } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { authErrorKey, signUp } from '../../lib/firebase/account'
import { checkPassword, validateUsername } from '../../lib/firebase/paths'

const USERNAME_ERROR: Record<string, string> = {
  'too-short': 'auth.error.usernameTooShort',
  'too-long': 'auth.error.usernameTooLong',
  charset: 'auth.error.usernameCharset',
  'edge-dot': 'auth.error.usernameEdgeDot',
  reserved: 'auth.error.usernameReserved',
}

export default function SignUp({ onBack, onLogIn }: { onBack: () => void; onLogIn: () => void }) {
  const t = useT()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usernameProblem = username.length > 0 ? validateUsername(username) : null
  const pw = checkPassword(password)
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const canSubmit =
    displayName.trim().length >= 2 &&
    username.length > 0 &&
    !usernameProblem &&
    emailOk &&
    pw.acceptable &&
    password === confirm &&
    !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await signUp({ displayName, username, email, password })
      // The auth listener takes it from here: verification, then onboarding.
    } catch (err) {
      setError(t(authErrorKey(err)))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.createTitle')}
      subtitle={t('auth.createSub')}
      back={
        <IconButton label={t('common.back')} onClick={onBack}>
          <IconChevronLeft size={22} />
        </IconButton>
      }
      footer={
        <div className="space-y-md">
          <Button full size="xl" variant="primary" disabled={!canSubmit} onClick={submit}>
            {busy ? t('common.loading') : t('auth.signUpCta')}
          </Button>
          <p className="text-center text-secondary text-muted">
            {t('auth.haveAccount')}{' '}
            <button onClick={onLogIn} className="font-semibold text-accent underline-offset-4 hover:underline">
              {t('auth.logInCta')}
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
          label={t('auth.displayName')}
          placeholder={t('auth.displayNamePlaceholder')}
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label={t('auth.username')}
          placeholder="diego"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={usernameProblem ? t(USERNAME_ERROR[usernameProblem]) : undefined}
        />
        <TextField
          label={t('auth.email')}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordRules password={password} confirm={confirm} />
        </div>
        <TextField
          label={t('auth.confirmPassword')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
      </form>
    </AuthShell>
  )
}
