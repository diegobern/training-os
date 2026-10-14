import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, ConfirmDialog, Sheet, TextField, cx } from '../ui/primitives'
import { IconAlert, IconCheck, IconChevronRight, IconRefresh } from '../ui/Icon'
import { useApp, useT } from '../../store/useApp'
import { useAuth } from '../../store/useAuth'
import { useWorkout } from '../../store/useWorkout'
import { useSyncStatus } from '../../store/useSync'
import { missingFirebaseKeys } from '../../lib/firebase/config'
import { authErrorKey, changePassword } from '../../lib/firebase/account'
import { syncNow } from '../../lib/sync/engine'
import { pendingCount } from '../../lib/sync/queue'
import { checkPassword } from '../../lib/firebase/paths'
import { fmtDate } from '../../lib/dates'
import { toast } from '../../store/useToast'

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-secondary text-muted">{label}</span>
      <span
        className={cx(
          'min-w-0 truncate text-right text-body',
          tone === 'ok' ? 'text-up' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function AccountSection() {
  const t = useT()
  const locale = useApp((s) => s.locale)
  const navigate = useNavigate()
  const { phase, user, profile, logout, deleteAccount } = useAuth()
  const sync = useSyncStatus()
  const [confirmLogout, setConfirmLogout] = useState(false)
  /** Lo que se perdería al cerrar sesión, leído al pulsar el botón. */
  const [logoutRisk, setLogoutRisk] = useState<{ activeWorkout: boolean; pending: number }>({
    activeWorkout: false,
    pending: 0,
  })
  const [pwOpen, setPwOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [deleteWord, setDeleteWord] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ------------------------------------------------- Firebase not wired up */
  if (phase === 'local-only') {
    const missing = missingFirebaseKeys()
    return (
      <Card className="border-warn/30 p-4">
        <p className="flex items-center gap-2 text-2xs font-bold tracking-wide text-warn">
          <IconAlert size={14} /> {t('auth.notConfiguredTitle')}
        </p>
        <p className="mt-2 text-body text-muted">{t('auth.notConfiguredBody')}</p>
        {missing.length > 0 && (
          <>
            <p className="mt-3 text-caption text-faint">{t('auth.missingVars')}</p>
            <ul className="mt-1 space-y-0.5">
              {missing.map((key) => (
                <li key={key} className="break-all font-mono text-caption text-muted">
                  {key}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    )
  }

  /**
   * Antes de preguntar, se mira qué se perdería: un entrenamiento en curso
   * (se descarta en este dispositivo) y cambios que aún no han subido. Se lee
   * en el momento, no del indicador de sincronización, que puede ir atrasado.
   */
  async function askLogout() {
    const activeWorkout = useWorkout.getState().session !== null
    let pending = 0
    try {
      pending = await pendingCount()
    } catch {
      /* sin poder leer el buzón, se pregunta igual, sin ese aviso */
    }
    setLogoutRisk({ activeWorkout, pending })
    setConfirmLogout(true)
  }
  const logoutRisky = logoutRisk.activeWorkout || logoutRisk.pending > 0

  const syncLabel =
    sync.phase === 'synced'
      ? t('sync.synced')
      : sync.phase === 'syncing' || sync.phase === 'restoring'
        ? t('sync.syncing')
        : sync.phase === 'offline'
          ? t('sync.offline')
          : sync.phase === 'error'
            ? t('sync.error')
            : t('sync.disabled')

  return (
    <>
      <Card className="divide-y divide-line px-4 py-1">
        <Row label={t('auth.email')} value={user?.email ?? '—'} />
        <Row label={t('auth.username')} value={profile?.username ? `@${profile.username}` : '—'} />
        <Row
          label={t('profile.memberSince')}
          value={profile?.createdAt ? fmtDate(profile.createdAt, locale, { month: 'long', year: 'numeric' }) : '—'}
        />
        <Row
          label={t('sync.status')}
          value={sync.pending > 0 ? `${syncLabel} · ${t('sync.pending', { n: sync.pending })}` : syncLabel}
          tone={sync.phase === 'error' ? 'warn' : sync.phase === 'synced' ? 'ok' : undefined}
        />
        <Row
          label={t('sync.lastSync')}
          value={sync.lastSyncedAt ? fmtDate(sync.lastSyncedAt, locale, { hour: '2-digit', minute: '2-digit' }) : t('sync.never')}
        />
      </Card>

      <div className="mt-md space-y-2">
        <Button full variant="secondary" icon={<IconRefresh size={16} />} onClick={() => void syncNow()}>
          {t('sync.syncNow')}
        </Button>

        <button
          onClick={() => navigate('/profile')}
          className="press flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-card"
        >
          <span className="min-w-0 flex-1 text-body text-ink">{t('profile.editProfile')}</span>
          <IconChevronRight size={17} className="text-faint" />
        </button>

        <Button full variant="secondary" onClick={() => setPwOpen(true)}>
          {t('account.changePassword')}
        </Button>
        <Button full variant="secondary" onClick={() => void askLogout()}>
          {t('account.logout')}
        </Button>
        <Button full variant="danger" onClick={() => setDeleteOpen(true)}>
          {t('account.delete')}
        </Button>
      </div>

      {/* ------------------------------------------------- change password */}
      <Sheet
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title={t('account.changePassword')}
        footer={
          <Button
            full
            size="lg"
            variant="primary"
            disabled={busy || !current || !checkPassword(next).acceptable}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await changePassword(current, next)
                toast(t('account.passwordChanged'), 'success')
                setPwOpen(false)
                setCurrent('')
                setNext('')
              } catch (err) {
                setError(t(authErrorKey(err)))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('common.save')}
          </Button>
        }
      >
        {error && <p className="mb-md text-secondary text-down">{error}</p>}
        <div className="space-y-md">
          <TextField
            label={t('account.currentPassword')}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <TextField
            label={t('account.newPassword')}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          {next.length > 0 && !checkPassword(next).acceptable && (
            <p className="text-caption text-faint">
              {t('auth.pwLength')} · {t('auth.pwLetter')} · {t('auth.pwNumber')}
            </p>
          )}
        </div>
      </Sheet>

      {/* -------------------------------------------------- delete account */}
      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('account.delete')}
        footer={
          <Button
            full
            size="lg"
            variant="danger"
            disabled={busy || deleteWord.trim().toUpperCase() !== t('account.deleteWord') || !deletePassword}
            onClick={async () => {
              if (!user) return
              setBusy(true)
              setError(null)
              try {
                // El orden (reautenticar antes de borrar nada en la nube) y
                // la vuelta atrás si algo falla viven en useAuth.deleteAccount.
                await deleteAccount(deletePassword)
                /*
                 * Para cuando esto se ejecuta, Firebase ya ha cerrado la sesión
                 * y esta pantalla ha desaparecido. El aviso se ve igual: vive
                 * en el almacén de avisos y el Toaster está fuera de la puerta
                 * de sesión (App.tsx), así que sale sobre la bienvenida.
                 */
                toast(t('account.deleted'), 'success')
              } catch (err) {
                setError(t(authErrorKey(err)))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('account.delete')}
          </Button>
        }
      >
        {error && <p className="mb-md text-secondary text-down">{error}</p>}
        <p className="flex items-start gap-2 text-body text-muted">
          <IconAlert size={16} className="mt-0.5 shrink-0 text-down" />
          {t('account.deleteWarning')}
        </p>
        <div className="mt-md space-y-md">
          <TextField
            label={t('auth.password')}
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
          <TextField
            label={t('account.deleteConfirmType')}
            value={deleteWord}
            autoCapitalize="characters"
            onChange={(e) => setDeleteWord(e.target.value)}
          />
          {deleteWord.trim().toUpperCase() === t('account.deleteWord') && (
            <p className="flex items-center gap-1.5 text-caption text-down">
              <IconCheck size={13} /> {t('common.confirm')}
            </p>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmLogout}
        title={t('account.logout')}
        body={t('account.logoutConfirm')}
        confirmLabel={logoutRisky ? t('account.logoutAnyway') : t('account.logout')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false)
          void logout()
        }}
      >
        {logoutRisky && (
          <div className="mt-md space-y-2">
            {logoutRisk.activeWorkout && (
              <p className="flex items-start gap-2 text-body text-down">
                <IconAlert size={16} className="mt-0.5 shrink-0" />
                {t('account.logoutActiveWorkout')}
              </p>
            )}
            {logoutRisk.pending > 0 && (
              <p className="flex items-start gap-2 text-body text-down">
                <IconAlert size={16} className="mt-0.5 shrink-0" />
                {t('account.logoutPending', { n: logoutRisk.pending })}
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
