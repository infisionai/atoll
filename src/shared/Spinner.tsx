import { IconSpinnerArc } from './icons'
import styles from './Spinner.module.css'

interface SpinnerProps {
  /** Size in px (default 14) */
  size?: number
  className?: string
}

/** Progress spinner — mandatory feedback for async action buttons (design-soul motion rules) */
export function Spinner({ size = 14, className }: SpinnerProps) {
  return (
    <IconSpinnerArc
      className={`${styles.spin} ${className ?? ''}`}
      width={size}
      height={size}
      role="status"
      aria-label="In progress"
    />
  )
}
