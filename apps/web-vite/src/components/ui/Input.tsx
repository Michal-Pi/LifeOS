import { forwardRef, type InputHTMLAttributes } from 'react'
import './FormField.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => {
    const classes = ['ui-input', error && 'ui-input--error', className].filter(Boolean).join(' ')

    return <input ref={ref} className={classes} {...props} />
  }
)

Input.displayName = 'Input'
