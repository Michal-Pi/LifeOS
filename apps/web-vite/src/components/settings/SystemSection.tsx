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
      <div className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <h2 className="settings-section__title">System</h2>
            <p className="settings-panel__meta">Monitor sync health and system status.</p>
          </div>
        </header>
        <SystemStatus />
      </div>
    </section>
  )
}
