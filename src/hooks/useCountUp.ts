import { useEffect, useRef, useState } from 'react'
import { animationsOn } from '../lib/feedback'

/** Animated number, honouring reduced-motion and the in-app animation switch. */
export function useCountUp(from: number, to: number, durationMs = 600) {
  const [value, setValue] = useState(animationsOn() ? from : to)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (!animationsOn()) {
      setValue(to)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (to - from) * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [from, to, durationMs])

  return value
}
