import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'secondary' | 'default'
}

export function Button({ variant = 'default', className = '', ...props }: ButtonProps) {
  const variantClass =
    variant === 'ghost' ? 'ghost-button' : variant === 'secondary' ? 'btn-secondary' : 'btn-primary'

  return <button className={`${variantClass} ${className}`} {...props} />
}
