/**
 * EventModalsContainer Component
 *
 * Manages all event-related modal dialogs and their state:
 * - Event form modal (create/edit)
 * - Delete confirmation modal
 * - Scope selection for recurring events
 *
 * This component encapsulates modal state management and provides
 * a clean interface for parent components via ref callbacks.
 */

import type { CanonicalCalendarEvent, EditScope } from '@lifeos/calendar'
import type { EventFormData } from '@/components/EventFormModal'
import { useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { EventFormModal } from '@/components/EventFormModal'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'

interface EventModalsContainerProps {
  selectedEvent: CanonicalCalendarEvent | null
  onCreateEvent: (data: EventFormData) => Promise<CanonicalCalendarEvent> | Promise<void> | void
  onUpdateEvent: (data: EventFormData, scope?: EditScope) => Promise<void> | void
  onDeleteEvent: (scope?: EditScope) => Promise<void> | void
}

export interface EventPrefill {
  title?: string
  startMs?: number
  endMs?: number
}

export interface EventModalsContainerHandle {
  openCreateModal: (prefill?: EventPrefill) => void
  openEditModal: () => void
  openDeleteModal: () => void
}

export const EventModalsContainer = forwardRef<
  EventModalsContainerHandle,
  EventModalsContainerProps
>(({ selectedEvent, onCreateEvent, onUpdateEvent, onDeleteEvent }, ref) => {
  // Modal state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editScope, setEditScope] = useState<EditScope | null>(null)
  const [prefillData, setPrefillData] = useState<EventPrefill | null>(null)

  // Open create modal with optional prefill data
  const openCreateModal = useCallback((prefill?: EventPrefill) => {
    setPrefillData(prefill ?? null)
    setFormMode('create')
    setFormModalOpen(true)
  }, [])

  // Open edit modal
  const openEditModal = useCallback(() => {
    if (!selectedEvent) return
    setFormMode('edit')
    setFormModalOpen(true)
  }, [selectedEvent])

  // Open delete modal
  const openDeleteModal = useCallback(() => {
    if (!selectedEvent) return
    setDeleteModalOpen(true)
  }, [selectedEvent])

  // Handle scope selection callback from EventFormModal
  const handleScopeSelect = useCallback((scope: EditScope) => {
    setEditScope(scope)
  }, [])

  // Handle form save
  const handleFormSave = useCallback(
    async (data: EventFormData) => {
      if (formMode === 'create') {
        await onCreateEvent(data)
      } else {
        await onUpdateEvent(data, editScope ?? undefined)
      }
    },
    [formMode, editScope, onCreateEvent, onUpdateEvent]
  )

  // Handle form close
  const handleFormClose = useCallback(() => {
    setFormModalOpen(false)
    setEditScope(null)
    setPrefillData(null)
  }, [])

  // Handle delete confirm
  const handleDeleteConfirm = useCallback(
    async (scope: EditScope | undefined) => {
      await onDeleteEvent(scope)
    },
    [onDeleteEvent]
  )

  // Expose methods via ref
  useImperativeHandle(
    ref,
    () => ({
      openCreateModal,
      openEditModal,
      openDeleteModal,
    }),
    [openCreateModal, openEditModal, openDeleteModal]
  )

  // Check if selected event is recurring
  const selectedIsRecurring = Boolean(
    selectedEvent?.recurrence?.recurrenceRules?.length ||
    selectedEvent?.providerRef?.recurringEventId
  )

  const isRecurrenceInstance = Boolean(
    formMode === 'edit' &&
    selectedEvent &&
    (selectedEvent.isRecurringSeries || selectedEvent.recurrenceV2?.rule)
  )

  return (
    <>
      {/* Event Form Modal */}
      <EventFormModal
        isOpen={formModalOpen}
        onClose={handleFormClose}
        onSave={handleFormSave}
        initialEvent={formMode === 'edit' ? selectedEvent : null}
        mode={formMode}
        isRecurrenceInstance={isRecurrenceInstance}
        onScopeSelect={handleScopeSelect}
        initialFormData={
          formMode === 'create' && prefillData
            ? {
                title: prefillData.title,
                ...(prefillData.startMs && prefillData.endMs
                  ? {
                      startDate: new Date(prefillData.startMs).toISOString().split('T')[0],
                      startTime: new Date(prefillData.startMs).toTimeString().slice(0, 5),
                      endDate: new Date(prefillData.endMs).toISOString().split('T')[0],
                      endTime: new Date(prefillData.endMs).toTimeString().slice(0, 5),
                    }
                  : {}),
              }
            : undefined
        }
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        eventTitle={selectedEvent?.title}
        isRecurring={selectedIsRecurring}
        isRecurrenceInstance={selectedIsRecurring}
      />
    </>
  )
})

EventModalsContainer.displayName = 'EventModalsContainer'
