import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet, cx } from '../ui/primitives'
import { IconAlert } from '../ui/Icon'
import { useT, useApp } from '../../store/useApp'
import { instructionsFor, loadMediaIndex } from '../../lib/catalog/store'
import type { InstructionEntry } from '../../lib/catalog/types'
import type { Exercise } from '../../lib/db/schema'

/**
 * How to perform an exercise, without leaving what you are doing.
 *
 * It is a sheet rather than a route on purpose. Opened from Workout Mode it
 * must not touch the router, unmount the session screen or disturb a single
 * set — you close it and you are back on the row you were typing into.
 *
 * Everything it shows is fetched when it opens: the instruction file is 146KB
 * gzipped and the illustrations are tens of kilobytes each, and none of that
 * belongs anywhere near app start.
 */

interface Frames {
  start: string | null
  mid: string | null
  end: string | null
}

export function HowToSheet({
  open,
  onClose,
  exercise,
}: {
  open: boolean
  onClose: () => void
  exercise: Exercise | null
}) {
  const t = useT()
  const lang = useApp((s) => s.settings.language)
  const [frames, setFrames] = useState<Frames | null>(null)
  const [info, setInfo] = useState<InstructionEntry | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !exercise) return
    let alive = true
    setLoading(true)
    setFrames(null)
    setInfo(null)

    void (async () => {
      try {
        const [media, text] = await Promise.all([
          exercise.mediaKey ? loadMediaIndex() : Promise.resolve(null),
          instructionsFor(exercise.id).catch(() => null),
        ])
        if (!alive) return
        if (media && exercise.mediaKey) {
          const hit = media.entries[exercise.mediaKey]
          if (hit) setFrames({ start: hit.s, mid: hit.m, end: hit.e })
        }
        setInfo(text)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [open, exercise])

  if (!exercise) return null

  /**
   * Which language the instructions are actually in.
   *
   * Spanish is used only when a Spanish translation genuinely exists. There is
   * no invented text and no half-translated paragraph: if the Spanish is
   * missing, the English original is shown and labelled as such, which is more
   * useful than a machine paraphrase of how to load a spine.
   */
  const spanishAvailable = lang === 'es' && !!info?.es?.length && info.esStatus !== 'missing'
  const steps = spanishAvailable ? (info?.es ?? []) : (info?.en ?? [])
  const showingEnglishInstead = lang === 'es' && steps.length > 0 && !spanishAvailable
  const cue = lang === 'es' ? (info?.cueEs ?? info?.cueEn) : info?.cueEn

  return (
    <Sheet open={open} onClose={onClose} title={exercise.name}>
      <div className="space-y-lg pb-2">
        {/* --- what it is ------------------------------------------------ */}
        <div className="flex flex-wrap gap-1.5">
          <Tag>{exercise.primaryMuscle}</Tag>
          <Tag muted>{t(`equipment.${exercise.equipment}`)}</Tag>
          {exercise.kind && exercise.kind !== 'strength' && <Tag muted>{t(`kind.${exercise.kind}`)}</Tag>}
        </div>

        {/* --- the demonstration ----------------------------------------- */}
        {frames ? (
          <FrameSequence frames={frames} name={exercise.name} />
        ) : loading ? (
          <div className="aspect-square w-full animate-pulse rounded-2xl bg-line/50" />
        ) : (
          /* No broken image, no grey placeholder pretending to be one. It
             says plainly that there is no illustration yet and gets out of
             the way of the instructions, which are the useful part. */
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
            <IconAlert size={17} className="shrink-0 text-faint" />
            <p className="text-secondary text-muted">{t('howto.noDemo')}</p>
          </div>
        )}

        {/* --- secondary muscles ------------------------------------------ */}
        {exercise.secondaryMuscles.length > 0 && (
          <Section label={t('howto.secondary')}>
            <div className="flex flex-wrap gap-1.5">
              {exercise.secondaryMuscles.map((m) => (
                <Tag key={m} muted>
                  {t(`muscle.${m}`)}
                </Tag>
              ))}
            </div>
          </Section>
        )}

        {/* --- our own cue ------------------------------------------------- */}
        {cue && (
          <Section label={t('howto.cue')}>
            <p className="text-body text-ink">{cue}</p>
          </Section>
        )}

        {/* --- the steps --------------------------------------------------- */}
        {steps.length > 0 ? (
          <Section label={t('howto.steps')}>
            {showingEnglishInstead && (
              <p className="mb-2 text-caption text-faint">{t('howto.englishOnly')}</p>
            )}
            <ol className="space-y-2.5">
              {steps.map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-line text-caption font-bold text-muted">
                    {i + 1}
                  </span>
                  <span className="text-body text-ink">{line}</span>
                </li>
              ))}
            </ol>
          </Section>
        ) : (
          !loading && <p className="text-secondary text-faint">{t('howto.noSteps')}</p>
        )}

        <button
          onClick={onClose}
          className="press w-full rounded-2xl bg-brand px-5 py-4 text-card font-bold text-brand-ink"
        >
          {t('howto.close')}
        </button>
      </div>
    </Sheet>
  )
}

/**
 * The three poses, played as a loop.
 *
 * Presented as what it is — a sequence of drawings — and never dressed up as a
 * video. There is no play button and no scrubber, because there is nothing to
 * scrub: three frames crossfading is an illustration that moves, and implying
 * otherwise would be a small lie the user discovers immediately.
 */
function FrameSequence({ frames, name }: { frames: Frames; name: string }) {
  const t = useT()
  const list = [frames.start, frames.mid, frames.end].filter(Boolean) as string[]
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!playing || list.length < 2) return
    const timer = window.setInterval(() => setI((n) => (n + 1) % list.length), 900)
    return () => window.clearInterval(timer)
  }, [playing, list.length])

  return (
    <div>
      <div className="demo-plate relative aspect-square w-full overflow-hidden rounded-2xl border border-line">
        {list.map((src, n) => (
          <img
            key={src}
            src={src}
            alt={n === 0 ? t('howto.startAlt', { name }) : n === list.length - 1 ? t('howto.endAlt', { name }) : ''}
            // Every frame is mounted and crossfaded rather than swapping one
            // src: swapping makes the browser decode on each change, which
            // flickers on a phone. Three small SVGs cost nothing to keep.
            className={cx(
              'absolute inset-0 h-full w-full object-contain p-4 transition-opacity duration-300',
              n === i ? 'opacity-100' : 'opacity-0',
            )}
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>

      {/* The credit CC BY-SA asks for, on the illustration itself. The full
          per-file record — including which frames derive from Everkinetic and
          what the upstream source changed — is on the attributions screen; it
          is a 30 KB file and does not belong in a workout. */}
      <p className="mt-2 text-caption leading-relaxed text-faint">
        {t('howto.credit')}{' '}
        <Link to="/attributions" className="font-semibold text-accent">
          {t('howto.creditLink')}
        </Link>
      </p>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1.5">
          {list.map((src, n) => (
            <button
              key={src}
              aria-label={`${n + 1}`}
              onClick={() => {
                setPlaying(false)
                setI(n)
              }}
              className={cx(
                'h-1.5 rounded-full transition-all',
                n === i ? 'w-6 bg-accent' : 'w-1.5 bg-line',
              )}
            />
          ))}
        </div>
        <span className="text-caption text-faint">
          {i === 0 ? t('howto.start') : i === list.length - 1 ? t('howto.end') : t('howto.mid')}
        </span>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-caption font-bold uppercase tracking-wide text-faint">{label}</h3>
      {children}
    </div>
  )
}

function Tag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cx(
        'rounded-full px-2.5 py-1 text-caption font-semibold',
        muted ? 'bg-line text-muted' : 'bg-accent/12 text-accent',
      )}
    >
      {children}
    </span>
  )
}
