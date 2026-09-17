import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import { Button, Card, SectionTitle } from '../components/ui/primitives'
import {
  IconBody,
  IconCalendar,
  IconChart,
  IconChevronRight,
  IconClock,
  IconInfo,
  IconList,
  IconMedal,
  IconRoutines,
  IconSearch,
  IconSettings,
  IconTrophy,
} from '../components/ui/Icon'
import { useT } from '../store/useApp'
import { useAuth } from '../store/useAuth'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import type { ReactNode } from 'react'

function Row({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="press flex w-full items-center gap-3 px-3.5 py-3.5 text-left">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-body font-medium">{label}</span>
      <IconChevronRight size={17} className="shrink-0 text-faint" />
    </button>
  )
}

export default function More() {
  const t = useT()
  const navigate = useNavigate()
  const install = useInstallPrompt()
  const authPhase = useAuth((s) => s.phase)
  const profile = useAuth((s) => s.profile)

  return (
    <Page title={t('more.title')} subtitle={t('more.subtitle')}>
      {!install.installed && (install.available || install.isIOS) && (
        <Card className="mb-5 border-accent/30 p-4">
          <p className="label-xs text-accent">{t('install.title')}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{t('install.body')}</p>
          {install.available ? (
            <Button variant="primary" className="mt-3" onClick={() => void install.promptInstall()}>
              {t('install.action')}
            </Button>
          ) : (
            <p className="mt-2 text-xs text-faint">{t('install.iosHint')}</p>
          )}
        </Card>
      )}

      {authPhase !== 'local-only' && (
        <Card className="mb-lg">
          <Row
            icon={<IconBody size={19} />}
            label={profile?.displayName ? `${profile.displayName}${profile.username ? ` · @${profile.username}` : ''}` : t('profile.title')}
            onClick={() => navigate('/profile')}
          />
        </Card>
      )}

      <SectionTitle>{t('more.trainSection')}</SectionTitle>
      <Card className="mb-5 divide-y divide-line">
        <Row icon={<IconRoutines size={19} />} label={t('nav.routines')} onClick={() => navigate('/routines')} />
        <Row icon={<IconList size={19} />} label={t('library.title')} onClick={() => navigate('/library')} />
        <Row icon={<IconClock size={19} />} label={t('history.title')} onClick={() => navigate('/history')} />
        <Row icon={<IconCalendar size={19} />} label={t('calendar.title')} onClick={() => navigate('/calendar')} />
      </Card>

      <SectionTitle>{t('nav.progress')}</SectionTitle>
      <Card className="mb-5 divide-y divide-line">
        <Row icon={<IconChart size={19} />} label={t('stats.title')} onClick={() => navigate('/stats')} />
        <Row icon={<IconTrophy size={19} />} label={t('pr.title')} onClick={() => navigate('/prs')} />
        <Row icon={<IconMedal size={19} />} label={t('milestones.title')} onClick={() => navigate('/milestones')} />
        <Row icon={<IconBody size={19} />} label={t('body.title')} onClick={() => navigate('/body')} />
      </Card>

      <SectionTitle>{t('more.dataSection')}</SectionTitle>
      <Card className="divide-y divide-line">
        <Row icon={<IconSearch size={19} />} label={t('search.title')} onClick={() => navigate('/search')} />
        <Row icon={<IconSettings size={19} />} label={t('settings.title')} onClick={() => navigate('/settings')} />
        <Row icon={<IconInfo size={19} />} label={t('attrib.title')} onClick={() => navigate('/attributions')} />
      </Card>

      <p className="mt-8 text-center text-caption text-faint">
        {t('app.name')} · {__APP_VERSION__}
      </p>
    </Page>
  )
}
