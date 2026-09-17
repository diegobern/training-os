import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import {
  Button,
  Card,
  IconButton,
  SectionTitle,
  Sheet,
  StatTile,
  TextField,
  cx,
} from '../components/ui/primitives'
import { IconCamera, IconCheck, IconPencil, IconTrophy } from '../components/ui/Icon'
import { useApp, useT } from '../store/useApp'
import { useAuth } from '../store/useAuth'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { listPRs, listSessions, logsInRange } from '../lib/db/repo.sessions'
import { statsFrom } from '../lib/training/stats'
import { fmtDate } from '../lib/dates'
import { fmtDuration, fmtVolume } from '../lib/format'
import { authErrorKey, changeUsername, writeProfile } from '../lib/firebase/account'
import { validateUsername } from '../lib/firebase/paths'
import { avatarStoragePath } from '../lib/firebase/paths'
import { getFirebase } from '../lib/firebase/app'
import { compressImage } from '../lib/db/repo.body'
import { toast } from '../store/useToast'

const USERNAME_ERROR: Record<string, string> = {
  'too-short': 'auth.error.usernameTooShort',
  'too-long': 'auth.error.usernameTooLong',
  charset: 'auth.error.usernameCharset',
  'edge-dot': 'auth.error.usernameEdgeDot',
  reserved: 'auth.error.usernameReserved',
}

export default function Profile() {
  const t = useT()
  const navigate = useNavigate()
  const { settings, locale } = useApp()
  const { user, profile, refreshProfile, phase } = useAuth()
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName)
    setUsername(profile.username)
    setAvatarUrl(profile.photoURL)
  }, [profile])

  const { data } = useLiveQuery(
    async () => {
      const [sessions, prs, logs] = await Promise.all([listSessions(), listPRs(), logsInRange(0)])
      return { sessions, prs, logs }
    },
    ['sessions', 'personalRecords', 'exerciseLogs'],
  )

  const stats = statsFrom(data?.sessions ?? [], data?.logs ?? [])
  const problem = username.length > 0 ? validateUsername(username) : null

  async function save() {
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      if (displayName.trim() !== profile?.displayName) {
        await writeProfile(user.uid, { displayName: displayName.trim() })
      }
      if (username.trim() && username.trim() !== profile?.username) {
        await changeUsername(user.uid, username.trim())
      }
      await refreshProfile()
      toast(t('profile.saved'), 'success')
      setEditing(false)
    } catch (err) {
      setError(t(authErrorKey(err)))
    } finally {
      setBusy(false)
    }
  }

  async function uploadAvatar(file: File) {
    if (!user) return
    const services = await getFirebase()
    if (!services) return
    setBusy(true)
    try {
      const { blob } = await compressImage(file, 512, 0.85)
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const path = avatarStoragePath(user.uid)
      const storageRef = ref(services.storage, path)
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(storageRef)
      await writeProfile(user.uid, { photoURL: url })
      setAvatarUrl(url)
      await refreshProfile()
      toast(t('profile.saved'), 'success')
    } catch {
      toast(t('auth.error.generic'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (phase === 'local-only') {
    return (
      <Page title={t('profile.title')} back subtitle={t('auth.localMode')}>
        <Card className="p-4">
          <p className="label-micro text-warn">{t('auth.notConfiguredTitle')}</p>
          <p className="mt-2 text-body text-muted">{t('auth.notConfiguredBody')}</p>
        </Card>
      </Page>
    )
  }

  const initials = (profile?.displayName || user?.email || '?').trim().slice(0, 1).toUpperCase()

  return (
    <Page
      title={t('profile.title')}
      back
      actions={
        <IconButton label={t('profile.editProfile')} onClick={() => setEditing(true)}>
          <IconPencil size={19} />
        </IconButton>
      }
    >
      <Card className="flex items-center gap-4 p-4">
        <label className="relative shrink-0 cursor-pointer">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-brand-ink text-metric">
              {initials}
            </span>
          )}
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-card">
            <IconCamera size={14} />
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadAvatar(f)
              e.target.value = ''
            }}
          />
        </label>
        <div className="min-w-0 flex-1">
          <p className="truncate text-card text-ink">{profile?.displayName || '—'}</p>
          {profile?.username && <p className="truncate text-body text-muted">@{profile.username}</p>}
          <p className="mt-1 truncate text-caption text-faint">{user?.email}</p>
        </div>
      </Card>

      <SectionTitle>{t('profile.stats')}</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label={t('stats.totalWorkouts')} value={stats.workouts} tone="accent" />
        <StatTile label={t('stats.totalVolume')} value={fmtVolume(stats.volume, settings.units)} />
        <StatTile label={t('stats.trainingTime')} value={fmtDuration(stats.durationSec, 'compact')} />
        <StatTile
          label={t('stats.prs')}
          value={data?.prs.length ?? 0}
          tone={data?.prs.length ? 'pr' : 'default'}
        />
      </div>

      <Card className="mt-lg flex items-center gap-3 p-4">
        <IconTrophy size={18} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-secondary text-muted">{t('profile.memberSince')}</p>
          <p className="text-card-sm text-ink">
            {profile?.createdAt
              ? fmtDate(profile.createdAt, locale, { day: 'numeric', month: 'long', year: 'numeric' })
              : '—'}
          </p>
        </div>
      </Card>

      <Button full variant="secondary" className="mt-lg" onClick={() => navigate('/settings')}>
        {t('settings.title')}
      </Button>

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={t('profile.editProfile')}
        footer={
          <Button full size="lg" variant="primary" disabled={busy || !!problem} onClick={save}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        }
      >
        {error && (
          <p className="mb-md rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-secondary text-down">
            {error}
          </p>
        )}
        <div className="space-y-md">
          <TextField
            label={t('auth.displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <TextField
            label={t('auth.username')}
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={problem ? t(USERNAME_ERROR[problem]) : undefined}
          />
          {!problem && username && username !== profile?.username && (
            <p className={cx('flex items-center gap-1.5 text-caption text-muted')}>
              <IconCheck size={13} /> @{username.toLowerCase()}
            </p>
          )}
        </div>
      </Sheet>
    </Page>
  )
}
