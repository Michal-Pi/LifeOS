import * as RadixSelect from '@radix-ui/react-select'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
}: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        className={`select-trigger ${className}`}
        aria-label={placeholder}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="select-icon">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 9L1 4h10z" fill="currentColor" />
          </svg>
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content className="select-content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport className="select-viewport">
            {options.map((option) => (
              <RadixSelect.Item key={option.value} value={option.value} className="select-item">
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="select-item-indicator">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
