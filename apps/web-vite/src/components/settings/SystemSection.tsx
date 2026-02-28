/**
 * @fileoverview System Settings Section
 *
 * Displays system status including sync health and diagnostics.
 * Wraps the existing SystemStatus component.
 */

import { SystemStatus } from '@/components/SystemStatus'

export function SystemSection() {
  return (
    <section id="system">
      <h2 className="settings-section__title">System</h2>
      <p className="settings-section__description">Monitor sync health and system status.</p>
      <SystemStatus />
    </section>
  )
}
