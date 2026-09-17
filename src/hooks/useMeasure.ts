import { useCallback, useEffect, useRef, useState } from 'react'

interface Size {
  width: number
  height: number
}

/**
 * Element size, kept current with ResizeObserver.
 * State is only updated when the size actually changes, so a chart that
 * re-renders on every pointer move cannot spiral into an update loop.
 */
export function useMeasure<T extends HTMLElement>() {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return

    const update = () => {
      const width = node.clientWidth
      const height = node.clientHeight
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }

    update()
    if (typeof ResizeObserver !== 'undefined') {
      observer.current = new ResizeObserver(update)
      observer.current.observe(node)
    }
  }, [])

  useEffect(
    () => () => {
      observer.current?.disconnect()
      observer.current = null
    },
    [],
  )

  return { ref, width: size.width, height: size.height }
}
