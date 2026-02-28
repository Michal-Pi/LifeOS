import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FormField } from '../FormField'

describe('FormField', () => {
  it('renders label text', () => {
    render(
      <FormField label="Email">
        <input />
      </FormField>
    )
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('shows required indicator when required', () => {
    render(
      <FormField label="Name" required>
        <input />
      </FormField>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows error message when error prop provided', () => {
    render(
      <FormField label="Email" error="Invalid email">
        <input />
      </FormField>
    )
    expect(screen.getByText('Invalid email')).toBeInTheDocument()
  })

  it('shows helper text', () => {
    render(
      <FormField label="Password" helperText="At least 8 characters">
        <input />
      </FormField>
    )
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
  })

  it('renders children (input)', () => {
    render(
      <FormField label="Test">
        <input data-testid="my-input" />
      </FormField>
    )
    expect(screen.getByTestId('my-input')).toBeInTheDocument()
  })
})
