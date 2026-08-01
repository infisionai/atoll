import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Spinner } from './Spinner'

interface BusyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Async action — spinner + disabled while in progress */
  onClick: () => Promise<unknown> | void
  children: ReactNode
  /** Spinner size (default 12) */
  spinnerSize?: number
}

/**
 * Async action button — switches to a spinner immediately on click and restores on completion/failure.
 * (design-soul: an async button without feedback is a quality defect)
 */
export function BusyButton({ onClick, children, spinnerSize = 12, disabled, ...rest }: BusyButtonProps) {
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => {
        const result = onClick()
        if (result instanceof Promise) {
          setBusy(true)
          void result.finally(() => setBusy(false))
        }
      }}
      {...rest}
    >
      {busy ? <Spinner size={spinnerSize} /> : children}
    </button>
  )
}
