import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Renders a long list a page at a time, growing as the user reaches the end.
 *
 * The catalog is 1096 exercises. Putting 1096 rows in the DOM is what turns a
 * smooth list into a stuttering one on a phone — the data is cheap, the layout
 * is not. So the list starts at one screenful and grows only when the sentinel
 * at the bottom becomes visible, which costs nothing when the user searches and
 * finds what they wanted in the first ten.
 *
 * `reset` deliberately depends on the caller's own signature of the query: a
 * new filter must start again from the top, otherwise a narrowed search would
 * still be showing three hundred rows.
 */
export function useIncremental<T>(items: T[], resetKey: unknown, page = 40) {
  const [limit, setLimit] = useState(page)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const key = JSON.stringify(resetKey)

  useEffect(() => {
    setLimit(page)
  }, [key, page])

  useEffect(() => {
    const el = sentinel.current
    if (!el || limit >= items.length) return
    // An observer rather than a scroll handler: no work at all while the user
    // is not near the end of the list.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + page)
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [limit, items.length, page])

  const visible = useMemo(() => items.slice(0, limit), [items, limit])
  return { visible, sentinel, hasMore: limit < items.length, total: items.length }
}
