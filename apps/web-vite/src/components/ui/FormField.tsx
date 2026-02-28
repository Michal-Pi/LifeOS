import type { ReactNode } from 'react'
import './FormField.css'

interface FormFieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  helperText?: string
  children: ReactNode
  className?: string
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  helperText,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={`ui-form-field${className ? ` ${className}` : ''}`}>
      <label className="ui-form-field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ui-form-field-required">*</span>}
      </label>
      {children}
      {error && <span className="ui-form-field-error">{error}</span>}
      {!error && helperText && <span className="ui-form-field-helper">{helperText}</span>}
    </div>
  )
}
