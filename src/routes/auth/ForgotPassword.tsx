import { useState } from 'react'
import { AuthError, AuthShell } from '../../components/auth/AuthShell'
import { Button, Card, IconButton, TextField } from '../../components/ui/primitives'
import { IconCheck, IconChevronLeft } from '../../components/ui/Icon'
import { useT } from '../../store/useApp'
import { authErrorKey, sendPasswordReset } from '../../lib/firebase/account'

export default function ForgotPassword({ onBack }: { onBack: () => void }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth.resetTitle')}
      subtitle={t('auth.resetSub')}
      back={
        <IconButton label={t('common.back')} onClick={onBack}>
          <IconChevronLeft size={22} />
        </IconButton>
      }
      footer={
        sent ? (
          <Button full size="xl" variant="secondary" onClick={onBack}>
            {t('common.back')}
          </Button>
        ) : (
          <Button full size="xl" variant="primary" disabled={busy || !email.trim()} onClick={submit}>
            {busy ? t('common.loading') : t('auth.resetSend')}
          </Button>
        )
      }
    >
      <AuthError message={error} />
      {sent ? (
        <Card className="flex items-start gap-3 p-4">
          <IconCheck size={18} className="mt-0.5 shrink-0 text-up" />
          <p className="text-body text-muted">{t('auth.resetSent')}</p>
        </Card>
      ) : (
        <form
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
          <button type="submit" className="sr-only" aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </AuthShell>
  )
}
