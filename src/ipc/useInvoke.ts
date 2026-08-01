import { useCallback, useEffect, useRef, useState } from 'react'

export interface InvokeState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  /** Reload */
  reload: () => void
}

/**
 * IPC query hook — wrapper so components never call invoke directly (by convention).
 * Returns loading/error/result in a consistent shape.
 */
export function useInvoke<T>(fn: () => Promise<T>, deps: readonly unknown[] = []): InvokeState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    setLoading(true)
    setError(null)
    fn().then(
      (result) => {
        if (!alive.current) return
        setData(result)
        setLoading(false)
      },
      (err: unknown) => {
        if (!alive.current) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )
    return () => {
      alive.current = false
    }
    // No eslint rule here — deps are specified explicitly by the caller
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { data, loading, error, reload }
}
