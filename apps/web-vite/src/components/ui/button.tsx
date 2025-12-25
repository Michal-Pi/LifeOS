import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'default'
}

export function Button({ variant = 'default', className = '', ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors'
  const variantStyles =
    variant === 'ghost' ? 'bg-transparent border-border text-foreground hover:bg-muted' : 'bg-primary text-primary-foreground border-transparent hover:bg-secondary'

  return <button className={`${base} ${variantStyles} ${className}`} {...props} />
}
