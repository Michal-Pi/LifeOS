import { forwardRef, type TextareaHTMLAttributes } from 'react'
import './FormField.css'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className, ...props }, ref) => {
    const classes = ['ui-textarea', error && 'ui-textarea--error', className]
      .filter(Boolean)
      .join(' ')

    return <textarea ref={ref} className={classes} {...props} />
  }
)

Textarea.displayName = 'Textarea'
