/**
 * People Page — Inner Circle CRM
 *
 * Master-detail layout: contact list with circle filter on the left,
 * contact detail panel on the right.
 */

import { useState, useCallback } from 'react'
import { useContacts } from '@/hooks/useContacts'
import { ContactList } from '@/components/contacts/ContactList'
import { ContactDetail } from '@/components/contacts/ContactDetail'
import { ContactFormModal } from '@/components/contacts/ContactFormModal'
import { DuplicateReviewModal } from '@/components/contacts/DuplicateReviewModal'
import type {
  ContactId,
  DunbarCircle,
  CreateContactInput,
  UpdateContactInput,
} from '@lifeos/agents'
import '@/styles/pages/PeoplePage.css'

export function PeoplePage() {
  const [selectedCircle, setSelectedCircle] = useState<DunbarCircle | undefined>(undefined)
  const [selectedContactId, setSelectedContactId] = useState<ContactId | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editContact, setEditContact] = useState<ContactId | null>(null)
  const [showDuplicates, setShowDuplicates] = useState(false)

  const { contacts, loading, createContact, updateContact, deleteContact } = useContacts({
    circle: selectedCircle,
    search: search || undefined,
  })

  // All contacts (unfiltered) for circle counts
  const { contacts: allContacts } = useContacts()

  const handleCreate = useCallback(
    async (data: CreateContactInput | UpdateContactInput) => {
      const created = await createContact(data as CreateContactInput)
      setSelectedContactId(created.contactId)
    },
    [createContact]
  )

  const handleUpdate = useCallback(
    async (data: CreateContactInput | UpdateContactInput) => {
      if (!editContact) return
      await updateContact(editContact, data as UpdateContactInput)
    },
    [editContact, updateContact]
  )

  const handleDelete = useCallback(async () => {
    if (!selectedContactId) return
    if (!window.confirm('Delete this contact? This cannot be undone.')) return
    await deleteContact(selectedContactId)
    setSelectedContactId(null)
  }, [selectedContactId, deleteContact])

  const handleEdit = useCallback(() => {
    if (selectedContactId) {
      setEditContact(selectedContactId)
    }
  }, [selectedContactId])

  const selectedContact = contacts.find((c) => c.contactId === selectedContactId)

  return (
    <div className="people-page">
      {/* Header */}
      <div className="people-page__header">
        <h1 className="people-page__title">People</h1>
        <div className="people-page__actions">
          <input
            className="people-page__search"
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="people-page__dedup-btn" onClick={() => setShowDuplicates(true)}>
            Find Duplicates
          </button>
          <button className="people-page__add-btn" onClick={() => setShowForm(true)}>
            + Add Contact
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="people-page__content">
        {/* Sidebar: circle filter + contact list */}
        <div className="people-page__sidebar">
          {loading ? (
            <div
              style={{
                padding: 'var(--space-6)',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
              }}
            >
              Loading contacts...
            </div>
          ) : allContacts.length === 0 && !search ? (
            <div className="people-page__empty-state">
              <div className="people-page__empty-state-title">No contacts yet</div>
              <div className="people-page__empty-state-desc">
                Add your first contact to start building your inner circle. Contacts will also be
                auto-created from your mailbox and calendar.
              </div>
              <button className="people-page__add-btn" onClick={() => setShowForm(true)}>
                + Add Contact
              </button>
            </div>
          ) : (
            <ContactList
              contacts={contacts}
              selectedId={selectedContactId}
              circle={selectedCircle}
              onCircleChange={setSelectedCircle}
              onSelect={setSelectedContactId}
            />
          )}
        </div>

        {/* Detail panel */}
        <div className="people-page__detail">
          {selectedContactId && selectedContact ? (
            <ContactDetail
              contactId={selectedContactId}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="people-page__empty-detail">
              <div className="people-page__empty-icon">{'\uD83D\uDC65'}</div>
              <div className="people-page__empty-text">Select a contact to view their profile</div>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {showForm && <ContactFormModal onSave={handleCreate} onClose={() => setShowForm(false)} />}

      {/* Edit modal */}
      {editContact && (
        <ContactFormModal
          contact={contacts.find((c) => c.contactId === editContact)}
          onSave={handleUpdate}
          onClose={() => setEditContact(null)}
        />
      )}

      {/* Duplicate review modal */}
      {showDuplicates && (
        <DuplicateReviewModal contacts={allContacts} onClose={() => setShowDuplicates(false)} />
      )}
    </div>
  )
}
