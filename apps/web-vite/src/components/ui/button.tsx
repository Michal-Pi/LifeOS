import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'secondary' | 'default'
}

export function Button({ variant = 'default', className = '', ...props }: ButtonProps) {
  const variantClass =
    variant === 'ghost' ? 'ghost-button' : variant === 'secondary' ? 'ghost-button' : 'primary-button'

  return <button className={`${variantClass} ${className}`} {...props} />
}
