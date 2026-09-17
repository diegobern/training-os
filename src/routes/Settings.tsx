import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Page } from '../components/layout/Page'
import {
  Button,
  Card,
  ConfirmDialog,
  IconButton,
  Segmented,
  Select,
  Sheet,
  Switch,
  TextField,
} from '../components/ui/primitives'
import { IconAlert, IconDots, IconDownload, IconUpload } from '../components/ui/Icon'
import { SettingsMenu } from '../components/settings/SettingsMenu'
import { AccountSection } from '../components/settings/AccountSection'
import { useApp, useT } from '../store/useApp'
import { useAuth } from '../store/useAuth'
import { MUSCLE_GROUPS, type Language, type ThemeMode, type Units } from '../lib/db/schema'
import { exportCsv, exportJson, importBackup, wipeEverything, type ImportMode } from '../lib/backup'
import { clearDemoData, loadDemoData } from '../lib/db/demo'
import { getLogs, requestPersistentStorage, storageInfo, subscribeLogs } from '../lib/db/database'
import { pushSettings } from '../lib/sync/engine'
import { toast } from '../store/useToast'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { trimNum } from '../lib/format'

function parseList(value: string): number[] {
  return value
    .split(/[,;\s]+/)
    .map((x) => Number(x.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
}

function bytes(n: number | null): string {
  if (n === null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 pt-lg first:pt-0">
      <h2 className="label-xs mb-sm">{title}</h2>
      {children}
    </section>
  )
}

export default function Settings() {
  const t = useT()
  const { settings, update } = useApp()
  const authUser = useAuth((s) => s.user)
  const install = useInstallPrompt()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [importOpen, setImportOpen] = useState(false)
  const [includePhotos, setIncludePhotos] = useState(false)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmClearDemo, setConfirmClearDemo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [storage, setStorage] = useState<{ usage: number | null; quota: number | null; persisted: boolean }>({
    usage: null,
    quota: null,
    persisted: false,
  })
  const [logsOpen, setLogsOpen] = useState(false)
  const [, forceLogs] = useState(0)

  useEffect(() => {
    void storageInfo().then(setStorage)
  }, [])
  useEffect(() => subscribeLogs(() => forceLogs((x) => x + 1)), [])

  /** Settings belong to the account, so every change is mirrored upward. */
  async function change(patch: Parameters<typeof update>[0]) {
    await update(patch)
    if (authUser) void pushSettings(authUser.uid)
  }

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleImport(file: File) {
    setBusy(true)
    try {
      const text = await file.text()
      const json: unknown = JSON.parse(text)
      const res = await importBackup(json, importMode)
      await useApp.getState().refreshSettings()
      toast(t('data.importOk', { n: res.imported }), 'success')
      setImportOpen(false)
    } catch (err) {
      toast(`${t('data.importError')}: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      back
      actions={
        <IconButton label={t('settings.quickMenu')} onClick={() => setMenuOpen(true)}>
          <IconDots size={20} />
        </IconButton>
      }
    >
      <Section id="account" title={t('settings.sectionAccount')}>
        <AccountSection />
      </Section>

      <Section id="appearance" title={t('settings.sectionAppearance')}>
        <Card className="space-y-md p-4">
          <div>
            <p className="label-micro mb-2">{t('settings.theme')}</p>
            <Segmented
              value={settings.theme}
              onChange={(v: ThemeMode) => void change({ theme: v })}
              options={[
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
                { value: 'system', label: t('settings.theme.system') },
              ]}
            />
          </div>
          <Select
            label={t('settings.language')}
            value={settings.language}
            onChange={(v: Language) => void change({ language: v })}
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Card>
      </Section>

      <Section id="training" title={t('settings.sectionTraining')}>
        <Card className="px-4 py-1">
          <div className="py-3">
            <p className="label-micro mb-2">{t('settings.intensity')}</p>
            <Segmented
              size="sm"
              value={settings.intensityMetric}
              onChange={(v) => void change({ intensityMetric: v })}
              options={[
                { value: 'rir', label: 'RIR' },
                { value: 'rpe', label: 'RPE' },
              ]}
            />
          </div>
          <div className="border-t border-line py-3">
            <TextField
              label={`${t('settings.defaultRest')} (s)`}
              inputMode="numeric"
              defaultValue={String(settings.defaultRestSeconds)}
              onChange={(e) => void change({ defaultRestSeconds: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div className="border-t border-line">
            <Switch
              label={t('settings.restAutoStart')}
              checked={settings.restAutoStart}
              onChange={(v) => void change({ restAutoStart: v })}
            />
          </div>
          <div className="border-t border-line">
            <Switch
              label={t('settings.autofill')}
              checked={settings.autofillPreviousSets}
              onChange={(v) => void change({ autofillPreviousSets: v })}
            />
          </div>
          <div className="border-t border-line">
            <Switch
              label={t('settings.excludeWarmups')}
              checked={settings.excludeWarmupsFromStats}
              onChange={(v) => void change({ excludeWarmupsFromStats: v })}
            />
          </div>
          <div className="border-t border-line py-3">
            <p className="label-micro mb-2">{t('settings.weekStart')}</p>
            <Segmented
              size="sm"
              value={String(settings.weekStartsOn)}
              onChange={(v) => void change({ weekStartsOn: v === '1' ? 1 : 0 })}
              options={[
                { value: '1', label: t('settings.monday') },
                { value: '0', label: t('settings.sunday') },
              ]}
            />
          </div>
        </Card>

        <h3 className="label-micro mb-2 mt-lg">{t('settings.weeklyTargets')}</h3>
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {MUSCLE_GROUPS.filter((m) => m !== 'other').map((m) => (
              <TextField
                key={m}
                label={t(`muscle.${m}`)}
                inputMode="numeric"
                defaultValue={String(settings.weeklySetTargets[m] ?? '')}
                onChange={(e) =>
                  void change({
                    weeklySetTargets: {
                      ...settings.weeklySetTargets,
                      [m]: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            ))}
          </div>
        </Card>
      </Section>

      <Section id="units" title={t('settings.sectionUnits')}>
        <Card className="space-y-md p-4">
          <div>
            <p className="label-micro mb-2">{t('settings.units')}</p>
            <Segmented
              value={settings.units}
              onChange={(v: Units) => void change({ units: v })}
              options={[
                { value: 'kg', label: 'KG' },
                { value: 'lb', label: 'LB' },
              ]}
            />
          </div>
          <p className="text-caption leading-relaxed text-faint">{t('settings.weightsHint')}</p>
          <TextField
            label={t('settings.dumbbells')}
            defaultValue={settings.availableWeights.dumbbells.map((n) => trimNum(n)).join(', ')}
            onChange={(e) =>
              void change({ availableWeights: { ...settings.availableWeights, dumbbells: parseList(e.target.value) } })
            }
          />
          <TextField
            label={t('settings.barbellPlates')}
            defaultValue={settings.availableWeights.barbellPlates.map((n) => trimNum(n)).join(', ')}
            onChange={(e) =>
              void change({
                availableWeights: { ...settings.availableWeights, barbellPlates: parseList(e.target.value) },
              })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={t('settings.barWeight')}
              inputMode="decimal"
              defaultValue={trimNum(settings.availableWeights.barWeight)}
              onChange={(e) =>
                void change({
                  availableWeights: {
                    ...settings.availableWeights,
                    barWeight: Number(e.target.value.replace(',', '.')) || 20,
                  },
                })
              }
            />
            <TextField
              label={t('settings.microPlates')}
              defaultValue={settings.availableWeights.microPlates.map((n) => trimNum(n)).join(', ')}
              onChange={(e) =>
                void change({
                  availableWeights: { ...settings.availableWeights, microPlates: parseList(e.target.value) },
                })
              }
            />
            <TextField
              label={t('settings.machineStep')}
              inputMode="decimal"
              defaultValue={trimNum(settings.availableWeights.machineStep)}
              onChange={(e) =>
                void change({
                  availableWeights: {
                    ...settings.availableWeights,
                    machineStep: Number(e.target.value.replace(',', '.')) || 5,
                  },
                })
              }
            />
            <TextField
              label={t('settings.cableStep')}
              inputMode="decimal"
              defaultValue={trimNum(settings.availableWeights.cableStep)}
              onChange={(e) =>
                void change({
                  availableWeights: {
                    ...settings.availableWeights,
                    cableStep: Number(e.target.value.replace(',', '.')) || 2.5,
                  },
                })
              }
            />
          </div>
        </Card>
      </Section>

      <Section id="feedback" title={t('settings.sectionFeedback')}>
        <Card className="px-4 py-1">
          <Switch label={t('settings.sounds')} checked={settings.sounds} onChange={(v) => void change({ sounds: v })} />
          <div className="border-t border-line">
            <Switch label={t('settings.haptics')} checked={settings.haptics} onChange={(v) => void change({ haptics: v })} />
          </div>
          <div className="border-t border-line">
            <Switch
              label={t('settings.animations')}
              checked={settings.animations}
              onChange={(v) => void change({ animations: v })}
            />
          </div>
          <div className="border-t border-line">
            <Switch
              label={`${t('workout.restTimer')} · ${t('settings.sounds')}`}
              checked={settings.restSound}
              onChange={(v) => void change({ restSound: v })}
            />
          </div>
          <div className="border-t border-line">
            <Switch
              label={`${t('workout.restTimer')} · ${t('settings.haptics')}`}
              checked={settings.restVibrate}
              onChange={(v) => void change({ restVibrate: v })}
            />
          </div>
        </Card>
      </Section>

      <Section id="data" title={t('settings.sectionData')}>
        <Card className="space-y-2.5 p-4">
          <p className="text-caption leading-relaxed text-faint">
            {authUser ? t('sync.status') : t('settings.dataLocal')}
          </p>
          <Switch
            label={t('body.photos')}
            hint={t('body.photoPrivacy')}
            checked={includePhotos}
            onChange={setIncludePhotos}
          />
          <Button
            full
            variant="secondary"
            icon={<IconDownload size={16} />}
            disabled={busy}
            onClick={async () => {
              const n = await exportJson(includePhotos)
              toast(`${t('data.exportOk')} · ${n}`, 'success')
            }}
          >
            {t('settings.export')}
          </Button>
          <Button
            full
            variant="secondary"
            icon={<IconDownload size={16} />}
            disabled={busy}
            onClick={async () => {
              const n = await exportCsv()
              toast(`${t('data.exportOk')} · ${n}`, 'success')
            }}
          >
            {t('settings.exportCsv')}
          </Button>
          <Button full variant="secondary" icon={<IconUpload size={16} />} onClick={() => setImportOpen(true)}>
            {t('settings.import')}
          </Button>
        </Card>

        <h3 className="label-micro mb-2 mt-lg">{t('settings.demoData')}</h3>
        <Card className="space-y-2.5 p-4">
          <p className="text-caption leading-relaxed text-faint">{t('settings.demoHint')}</p>
          {settings.demoDataPresent ? (
            <Button full variant="danger" disabled={busy} onClick={() => setConfirmClearDemo(true)}>
              {t('settings.clearDemo')}
            </Button>
          ) : (
            <Button
              full
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const n = await loadDemoData()
                  toast(`${t('data.demoLoaded')} · ${n}`, 'success')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('settings.loadDemo')}
            </Button>
          )}
        </Card>
      </Section>

      <Section id="about" title={t('settings.sectionAbout')}>
        <Card className="space-y-2.5 p-4">
          <p className="tnum text-body text-muted">
            {t('settings.storageUsed', { used: bytes(storage.usage), quota: bytes(storage.quota) })}
          </p>
          <p className="text-caption text-faint">
            {storage.persisted ? t('settings.persisted') : t('settings.notPersisted')}
          </p>
          {!storage.persisted && (
            <Button
              full
              variant="secondary"
              onClick={async () => {
                await requestPersistentStorage()
                setStorage(await storageInfo())
              }}
            >
              {t('settings.requestPersist')}
            </Button>
          )}
          {install.installed ? (
            <p className="text-caption font-semibold text-accent">{t('settings.installed')}</p>
          ) : install.available ? (
            <Button full variant="primary" onClick={() => void install.promptInstall()}>
              {t('settings.install')}
            </Button>
          ) : install.isIOS ? (
            <p className="text-caption text-faint">{t('install.iosHint')}</p>
          ) : null}
          <Button full variant="ghost" onClick={() => setLogsOpen(true)}>
            {t('settings.diagnostics')}
          </Button>
          <p className="text-center text-caption text-faint">
            {t('settings.version')} {__APP_VERSION__}
          </p>
        </Card>

        <h3 className="label-micro mb-2 mt-lg text-down">{t('settings.dangerZone')}</h3>
        <Card className="border-down/30 p-4">
          <p className="flex items-start gap-2 text-caption leading-relaxed text-muted">
            <IconAlert size={14} className="mt-0.5 shrink-0 text-down" />
            {t('settings.wipeConfirm')}
          </p>
          <Button full variant="danger" className="mt-3" onClick={() => setConfirmWipe(true)}>
            {t('settings.wipe')}
          </Button>
        </Card>
      </Section>

      <SettingsMenu open={menuOpen} onClose={() => setMenuOpen(false)} onJump={jump} />

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title={t('settings.import')}>
        <Segmented
          value={importMode}
          onChange={setImportMode}
          options={[
            { value: 'merge', label: t('data.importMerge') },
            { value: 'replace', label: t('data.importReplace') },
          ]}
        />
        <p className="mt-2 text-caption leading-relaxed text-faint">
          {importMode === 'merge' ? t('data.importMergeHint') : t('data.importReplaceHint')}
        </p>
        <Button
          full
          size="lg"
          variant="primary"
          className="mt-4"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {t('data.importChoose')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImport(f)
            e.target.value = ''
          }}
        />
      </Sheet>

      <Sheet open={logsOpen} onClose={() => setLogsOpen(false)} title={t('settings.logs')} size="full">
        <div className="space-y-1.5">
          {getLogs().length === 0 && <p className="text-body text-faint">{t('common.empty')}</p>}
          {getLogs().map((l, i) => (
            <div key={i} className="rounded-lg border border-line bg-elevated px-2.5 py-1.5">
              <p className="tnum text-2xs text-faint">
                {new Date(l.at).toLocaleTimeString()} · {l.scope} · {l.level}
              </p>
              <p className="break-words text-caption text-muted">{l.message}</p>
            </div>
          ))}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmClearDemo}
        title={t('settings.clearDemo')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmClearDemo(false)}
        onConfirm={async () => {
          setConfirmClearDemo(false)
          setBusy(true)
          try {
            await clearDemoData()
            toast(t('data.demoCleared'), 'success')
          } finally {
            setBusy(false)
          }
        }}
      />

      <ConfirmDialog
        open={confirmWipe}
        title={t('settings.wipe')}
        body={t('settings.wipeConfirm')}
        confirmLabel={t('settings.wipe')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmWipe(false)}
        onConfirm={async () => {
          setConfirmWipe(false)
          await wipeEverything()
          toast(t('data.wiped'), 'success')
          setTimeout(() => location.reload(), 600)
        }}
      />
    </Page>
  )
}
