/**
 * @fileoverview General Settings Section
 *
 * Theme toggle (light/dark/auto with schedule) and agent memory span slider.
 * Renders inside the settings page scroll-spy layout.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/contexts/useTheme'
import { useAgentMemorySettings } from '@/hooks/useAgentMemorySettings'
import { SegmentedControl } from '@/components/SegmentedControl'
import { StatusDot } from '@/components/StatusDot'

export interface GeneralSettingsSectionProps {
  userId: string | undefined
  onError: (message: string) => void
}

export function GeneralSettingsSection({ userId, onError }: GeneralSettingsSectionProps) {
  const { mode, autoMode, schedule, setMode, setAutoMode, setSchedule } = useTheme()
  const {
    settings: memorySettings,
    isLoading: memoryLoading,
    error: memoryError,
    saveMemoryLimit,
    clearMemoryLimit,
  } = useAgentMemorySettings(userId)

  const [memoryLimitInput, setMemoryLimitInput] = useState('')
  const [memorySaving, setMemorySaving] = useState(false)

  const effectiveMemoryLimit = memorySettings.memoryMessageLimit ?? 50

  useEffect(() => {
    if (memorySettings.memoryMessageLimit) {
      setMemoryLimitInput(String(memorySettings.memoryMessageLimit))
    } else {
      setMemoryLimitInput('')
    }
  }, [memorySettings.memoryMessageLimit])

  const handleSaveMemoryLimit = useCallback(async () => {
    const parsed = Number.parseInt(memoryLimitInput, 10)
    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 200) {
      onError('Memory span must be a number between 1 and 200.')
      return
    }

    try {
      setMemorySaving(true)
      await saveMemoryLimit(parsed)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setMemorySaving(false)
    }
  }, [memoryLimitInput, saveMemoryLimit, onError])

  const handleClearMemoryLimit = useCallback(async () => {
    try {
      setMemorySaving(true)
      await clearMemoryLimit()
      setMemoryLimitInput('')
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setMemorySaving(false)
    }
  }, [clearMemoryLimit, onError])

  const memorySpanValue = Number.parseInt(memoryLimitInput, 10)
  const memorySpanDisplay = Number.isNaN(memorySpanValue) ? effectiveMemoryLimit : memorySpanValue
  const memorySpanStatus = memorySettings.memoryMessageLimit ? 'online' : 'idle'
  const isMemoryInputEmpty = memoryLimitInput.trim().length === 0

  return (
    <section id="general">
      <h2 className="settings-section__title">General</h2>
      <p className="settings-section__description">Theme, appearance, and agent memory defaults.</p>

      <div className="settings-section__grid">
        <div className="settings-panel">
          <header className="settings-panel__header">
            <div>
              <p className="section-label">Appearance</p>
              <h3>Theme Mode</h3>
              <p className="settings-panel__meta">
                Choose a theme or follow system settings. Auto can use OS or a custom schedule.
              </p>
            </div>
          </header>
          <div className="settings-panel__content theme-controls">
            <div className="theme-control-row">
              <SegmentedControl
                value={mode}
                onChange={(value) => setMode(value as 'light' | 'dark' | 'auto')}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'auto', label: 'Auto' },
                ]}
              />
            </div>
            {mode === 'auto' && (
              <div className="theme-auto-controls">
                <div className="theme-control-row">
                  <SegmentedControl
                    value={autoMode}
                    onChange={(value) => setAutoMode(value as 'system' | 'schedule')}
                    options={[
                      { value: 'system', label: 'Follow OS' },
                      { value: 'schedule', label: 'Scheduled' },
                    ]}
                  />
                </div>
                {autoMode === 'schedule' && (
                  <div className="theme-schedule-grid">
                    <div className="form-group">
                      <label htmlFor="theme-schedule-start">Dark mode starts</label>
                      <input
                        id="theme-schedule-start"
                        type="time"
                        value={schedule.start}
                        onChange={(event) =>
                          setSchedule({ ...schedule, start: event.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="theme-schedule-end">Dark mode ends</label>
                      <input
                        id="theme-schedule-end"
                        type="time"
                        value={schedule.end}
                        onChange={(event) => setSchedule({ ...schedule, end: event.target.value })}
                      />
                    </div>
                  </div>
                )}
                {autoMode === 'schedule' && (!schedule.start || !schedule.end) && (
                  <p className="settings-panel__meta theme-schedule-hint">
                    Set both start and end times to enable scheduled switching.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="settings-panel">
          <header className="settings-panel__header">
            <div>
              <p className="section-label">Agent Memory</p>
              <h3>Memory Span</h3>
              <p className="settings-panel__meta">
                Define how many recent messages agents should remember when resuming work.
              </p>
            </div>
          </header>

          {memoryError && <p className="settings-panel__error">&#x26A0; {memoryError}</p>}
          {memoryLoading && <p className="settings-panel__meta">Loading memory settings...</p>}

          <div className="memory-panel">
            <div className="memory-panel__header">
              <div>
                <p className="section-label">Default Span</p>
                <h4>{memorySpanDisplay} messages</h4>
              </div>
              <div className="memory-panel__status">
                <StatusDot status={memorySpanStatus} label="Memory span status" />
                <span>{memorySettings.memoryMessageLimit ? 'Custom' : 'System default'}</span>
              </div>
            </div>

            <div className="memory-panel__controls">
              <input
                type="range"
                min={1}
                max={200}
                value={memorySpanDisplay}
                onChange={(e) => setMemoryLimitInput(e.target.value)}
                className="memory-range"
              />
              <div className="memory-panel__inputs">
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={memoryLimitInput}
                  onChange={(e) => setMemoryLimitInput(e.target.value)}
                  placeholder="e.g., 50"
                  className="settings-code-input"
                />
                <div className="provider-card__actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleClearMemoryLimit()}
                    disabled={!memorySettings.memoryMessageLimit || memorySaving}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSaveMemoryLimit()}
                    disabled={memorySaving || isMemoryInputEmpty}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            <details className="settings-accordion">
              <summary>Advanced context rules</summary>
              <p>
                Resolution order: run override &rarr; workflow override &rarr; global default &rarr;
                built-in default (50). Keep the span lean to reduce drift.
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  )
}
