import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/layout/Page'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SectionTitle,
  Sheet,
  TextField,
  cx,
} from '../components/ui/primitives'
import { IconCopy, IconDots, IconPlus, IconRoutines, IconTrash } from '../components/ui/Icon'
import { useLiveQuery } from '../hooks/useLiveQuery'
import {
  archiveRoutine,
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  listRoutines,
  setActiveRoutine,
} from '../lib/db/repo.routines'
import { useT } from '../store/useApp'
import type { Routine } from '../lib/db/schema'
import { toast } from '../store/useToast'

const TEMPLATES: { key: string; name: string; days: string[] }[] = [
  { key: 'blank', name: '', days: [] },
  { key: 'ppl', name: 'Push / Pull / Legs', days: ['PUSH', 'PULL', 'LEGS'] },
  { key: 'ul', name: 'Upper / Lower', days: ['UPPER A', 'LOWER A', 'UPPER B', 'LOWER B'] },
  { key: 'ppl5', name: 'PPL + Upper/Lower', days: ['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER'] },
  { key: 'fullbody', name: 'Full Body', days: ['FULL BODY A', 'FULL BODY B', 'FULL BODY C'] },
]

export default function Routines() {
  const t = useT()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('ppl')
  const [menuFor, setMenuFor] = useState<Routine | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const { data } = useLiveQuery(() => listRoutines(true), ['routines'])
  const all = data ?? []
  const live = all.filter((r) => !r.archivedAt)
  const archived = all.filter((r) => r.archivedAt)

  async function create() {
    const tpl = TEMPLATES.find((x) => x.key === template)!
    const finalName = name.trim() || tpl.name || t('routines.new')
    const routine = await createRoutine(finalName, tpl.days)
    setCreating(false)
    setName('')
    navigate(`/routines/${routine.id}`)
  }

  return (
    <Page
      title={t('routines.title')}
      subtitle={t('routines.subtitle')}
      actions={
        <IconButton label={t('routines.new')} tone="accent" onClick={() => setCreating(true)}>
          <IconPlus size={22} />
        </IconButton>
      }
    >
      {live.length === 0 ? (
        <EmptyState
          icon={<IconRoutines size={28} />}
          title={t('routines.empty')}
          body={t('routines.emptyBody')}
          action={
            <Button variant="primary" size="lg" onClick={() => setCreating(true)}>
              {t('routines.new')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {live.map((r) => (
            <Card key={r.id} className={cx('overflow-hidden', r.isActive && 'border-accent/40')}>
              <button
                className="press flex w-full items-start gap-3 p-4 text-left"
                onClick={() => navigate(`/routines/${r.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-card">{r.name}</h3>
                    {r.isActive && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-bold tracking-wide text-accent">
                        {t('routines.active')}
                      </span>
                    )}
                    {r.demo && (
                      <span className="shrink-0 rounded-full bg-info/15 px-2 py-0.5 text-2xs font-bold tracking-wide text-info">
                        {t('common.demo')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    {t('routines.dayCount', { n: r.days.length })} ·{' '}
                    {t('routines.exerciseCount', { n: r.days.reduce((a, d) => a + d.exercises.length, 0) })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.days.slice(0, 6).map((d) => (
                      <span key={d.id} className="rounded-md bg-elevated px-2 py-0.5 text-caption font-medium text-muted">
                        {d.name}
                      </span>
                    ))}
                  </div>
                </div>
                <IconButton
                  label={t('common.more')}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuFor(r)
                  }}
                >
                  <IconDots size={18} />
                </IconButton>
              </button>
              {!r.isActive && (
                <button
                  onClick={async () => {
                    await setActiveRoutine(r.id)
                    toast(t('routines.setActive'), 'success')
                  }}
                  className="press w-full border-t border-line py-2.5 text-xs font-bold tracking-wide text-accent"
                >
                  {t('routines.setActive')}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <section className="mt-6">
          <SectionTitle
            action={
              <button onClick={() => setShowArchived((v) => !v)} className="-my-2 inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-semibold text-accent">
                {showArchived ? t('common.close') : `${archived.length}`}
              </button>
            }
          >
            {t('routines.archived')}
          </SectionTitle>
          {showArchived && (
            <div className="flex flex-col gap-2">
              {archived.map((r) => (
                <div key={r.id} className="card flex items-center gap-2 px-3.5 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => void archiveRoutine(r.id, false)}>
                    {t('common.unarchive')}
                  </Button>
                  <IconButton label={t('common.delete')} size="sm" tone="danger" onClick={() => setConfirmDelete(r)}>
                    <IconTrash size={16} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* create */}
      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={t('routines.new')}
        footer={
          <Button full size="lg" variant="primary" onClick={create}>
            {t('common.create')}
          </Button>
        }
      >
        <TextField
          label={t('common.name')}
          placeholder={t('routines.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <p className="label-xs mb-2 mt-5">{t('routines.templates')}</p>
        <div className="flex flex-col gap-2">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => setTemplate(tpl.key)}
              className={cx(
                'press rounded-xl border px-3.5 py-3 text-left transition-colors',
                template === tpl.key ? 'border-accent/60 bg-accent/[0.07]' : 'border-line bg-elevated',
              )}
            >
              <p className="text-sm font-semibold">{tpl.name || t('routines.blank')}</p>
              {tpl.days.length > 0 && (
                <p className="mt-0.5 text-xs text-faint">{tpl.days.join(' · ')}</p>
              )}
            </button>
          ))}
        </div>
      </Sheet>

      {/* per-routine menu */}
      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              icon={<IconCopy size={16} />}
              onClick={async () => {
                const copy = await duplicateRoutine(menuFor.id)
                setMenuFor(null)
                if (copy) navigate(`/routines/${copy.id}`)
              }}
            >
              {t('common.duplicate')}
            </Button>
            {!menuFor.isActive && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await setActiveRoutine(menuFor.id)
                  setMenuFor(null)
                }}
              >
                {t('routines.setActive')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={async () => {
                await archiveRoutine(menuFor.id, !menuFor.archivedAt)
                setMenuFor(null)
              }}
            >
              {menuFor.archivedAt ? t('common.unarchive') : t('common.archive')}
            </Button>
            <Button
              variant="danger"
              icon={<IconTrash size={16} />}
              onClick={() => {
                setConfirmDelete(menuFor)
                setMenuFor(null)
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!confirmDelete}
        title={t('common.delete')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await deleteRoutine(confirmDelete.id)
            toast(t('routines.deleted'), 'success')
          }
          setConfirmDelete(null)
        }}
      />
    </Page>
  )
}
