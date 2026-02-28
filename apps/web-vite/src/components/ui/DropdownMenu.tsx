import type { ReactNode } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import './DropdownMenu.css'

interface DropdownMenuItem {
  id: string
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface DropdownMenuProps {
  trigger: ReactNode
  items: DropdownMenuItem[]
  align?: 'start' | 'end'
  className?: string
}

export function DropdownMenu({ trigger, items, align = 'end', className }: DropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className={`ui-dropdown-content${className ? ` ${className}` : ''}`}
          align={align}
          sideOffset={4}
        >
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.id}
              className={`ui-dropdown-item${item.danger ? ' ui-dropdown-item--danger' : ''}`}
              disabled={item.disabled}
              onSelect={item.onClick}
            >
              {item.icon}
              {item.label}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  )
}
