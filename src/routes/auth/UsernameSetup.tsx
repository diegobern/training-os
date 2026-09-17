import { useState } from 'react'
import { AuthError, AuthShell } from '../../components/auth/AuthShell'
import { Button, TextField } from '../../components/ui/primitives'
import { useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'
import { authErrorKey, finishUsernameSetup } from '../../lib/firebase/account'
import { validateUsername } from '../../lib/firebase/paths'

const USERNAME_ERROR: Record<string, string> = {
  'too-short': 'auth.error.usernameTooShort',
  'too-long': 'auth.error.usernameTooLong',
  charset: 'auth.error.usernameCharset',
  'edge-dot': 'auth.error.usernameEdgeDot',
  reserved: 'auth.error.usernameReserved',
}

export default function UsernameSetup() {
  const t = useT()
  const user = useAuth((s) => s.user)
  const resolve = useAuth((s) => s.resolve)
  const logout = useAuth((s) => s.logout)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem = username.length > 0 ? validateUsername(username) : null

  async function submit() {
    if (!user || problem || !username || busy) return
    setBusy(true)
    setError(null)
    try {
      await finishUsernameSetup(user.uid, username)
      await resolve()
    } catch (err) {
      setError(t(authErrorKey(err)))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.usernameTitle')}
      subtitle={t('auth.usernameSub')}
      footer={
        <div className="space-y-md">
          <Button full size="xl" variant="primary" disabled={busy || !username || !!problem} onClick={submit}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
          <button onClick={() => void logout()} className="w-full text-secondary text-faint underline-offset-4 hover:underline">
            {t('account.logout')}
          </button>
        </div>
      }
    >
      <AuthError message={error} />
      <TextField
        label={t('auth.username')}
        placeholder="diego"
        autoCapitalize="none"
        autoCorrect="off"
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={problem ? t(USERNAME_ERROR[problem]) : undefined}
      />
    </AuthShell>
  )
}
