import { useEffect, useMemo, useState } from 'react'
import { Page } from '../components/layout/Page'
import { Card, TextField } from '../components/ui/primitives'
import { useIncremental } from '../hooks/useIncremental'
import { loadAttributions } from '../lib/catalog/store'
import { fold } from '../lib/catalog/resolve'
import type { MediaAttribution } from '../lib/catalog/types'
import { useT } from '../store/useApp'

/**
 * The credits screen CC BY-SA 4.0 requires.
 *
 * It is a real obligation, not a courtesy: the licence asks for the author, a
 * link to the licence, and a note of any change. All three are here, per
 * illustration, alongside the file they belong to.
 *
 * The attribution file is 30 KB gzipped and is fetched only by this screen —
 * nobody downloads the credits in order to log a set.
 */
export default function Attributions() {
  const t = useT()
  const [entries, setEntries] = useState<MediaAttribution[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    loadAttributions()
      .then((file) => {
        if (alive) setEntries(Object.values(file.entries))
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const list = useMemo(() => {
    const all = entries ?? []
    const q = fold(search.trim())
    const filtered = q ? all.filter((e) => fold(`${e.slug} ${e.originalAuthor} ${e.source}`).includes(q)) : all
    return [...filtered].sort((a, b) => a.slug.localeCompare(b.slug))
  }, [entries, search])

  const { visible, sentinel, hasMore } = useIncremental(list, search, 30)

  return (
    <Page title={t('attrib.title')} subtitle={t('attrib.subtitle')} back>
      <Card className="p-4">
        <p className="text-secondary leading-relaxed text-muted">{t('attrib.summary')}</p>
        <div className="mt-3 flex flex-col gap-1">
          <a className="text-secondary font-semibold text-accent" href="https://github.com/bryllim/workout-guide" target="_blank" rel="noreferrer noopener">
            Workout Guide — Bryl Lim
          </a>
          <a className="text-secondary font-semibold text-accent" href="https://github.com/everkinetic/data" target="_blank" rel="noreferrer noopener">
            Everkinetic
          </a>
          <a className="text-secondary font-semibold text-accent" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer noopener">
            CC BY-SA 4.0
          </a>
        </div>
        <p className="mt-3 text-caption leading-relaxed text-faint">{t('attrib.noChanges')}</p>
        <p className="mt-2 text-caption leading-relaxed text-faint">{t('attrib.codeSeparate')}</p>
      </Card>

      <Card className="mt-3 p-4">
        <p className="label-xs mb-2">{t('attrib.metadata')}</p>
        <p className="text-caption leading-relaxed text-faint">{t('attrib.metadataBody')}</p>
      </Card>

      {failed && <p className="mt-4 text-secondary text-faint">{t('attrib.failed')}</p>}

      {entries && (
        <>
          <div className="mt-5">
            <TextField
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <p className="mt-3 text-caption text-faint">{t('attrib.count', { n: list.length })}</p>

          <ul className="mt-2 flex flex-col gap-1.5">
            {visible.map((e) => (
              <li key={e.slug} className="rounded-xl border border-line bg-elevated px-3.5 py-3">
                <p className="text-card-sm">{e.slug}</p>
                <p className="mt-1 text-caption leading-relaxed text-muted">{e.attribution}</p>
                {e.changes && (
                  <p className="mt-1 text-caption leading-relaxed text-faint">
                    {t('attrib.upstreamChange')} {e.changes}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-x-3">
                  <a className="text-caption font-semibold text-accent" href={e.sourceUrl} target="_blank" rel="noreferrer noopener">
                    {e.source}
                  </a>
                  {e.originalSourceUrl && (
                    <a className="text-caption font-semibold text-accent" href={e.originalSourceUrl} target="_blank" rel="noreferrer noopener">
                      {e.originalSource}
                    </a>
                  )}
                  <a className="text-caption font-semibold text-accent" href={e.licenseUrl} target="_blank" rel="noreferrer noopener">
                    {e.license}
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && <div ref={sentinel} className="h-10" aria-hidden="true" />}
        </>
      )}
    </Page>
  )
}
