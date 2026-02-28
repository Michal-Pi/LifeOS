/**
 * ContactFormModal — create/edit contact form
 */

import { useState, useCallback } from 'react'
import type { Contact, DunbarCircle, CreateContactInput, UpdateContactInput } from '@lifeos/agents'
import { CIRCLE_LABELS, CIRCLE_TO_SIGNIFICANCE } from '@lifeos/agents'
import { Modal } from '@/components/ui/Modal'
import '@/styles/components/ContactFormModal.css'

interface ContactFormModalProps {
  contact?: Contact | null
  onSave: (data: CreateContactInput | UpdateContactInput) => Promise<void>
  onClose: () => void
}

const CIRCLES: DunbarCircle[] = [0, 1, 2, 3, 4]

export function ContactFormModal({ contact, onSave, onClose }: ContactFormModalProps) {
  const isEditing = !!contact

  const [displayName, setDisplayName] = useState(contact?.displayName ?? '')
  const [firstName, setFirstName] = useState(contact?.firstName ?? '')
  const [lastName, setLastName] = useState(contact?.lastName ?? '')
  const [title, setTitle] = useState(contact?.title ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [relationship, setRelationship] = useState(contact?.relationship ?? '')
  const [circle, setCircle] = useState<DunbarCircle>(contact?.circle ?? 4)
  const [emails, setEmails] = useState(contact?.identifiers.emails.join(', ') ?? '')
  const [phones, setPhones] = useState(contact?.identifiers.phones.join(', ') ?? '')
  const [linkedinSlug, setLinkedinSlug] = useState(contact?.identifiers.linkedinSlug ?? '')
  const [tags, setTags] = useState(contact?.tags.join(', ') ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!displayName.trim()) return

      setSaving(true)
      try {
        const emailList = emails
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
        const phoneList = phones
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
        const tagList = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)

        if (isEditing) {
          const updates: UpdateContactInput = {
            displayName: displayName.trim(),
            firstName: firstName.trim() || undefined,
            lastName: lastName.trim() || undefined,
            title: title.trim() || undefined,
            company: company.trim() || undefined,
            relationship: relationship.trim() || undefined,
            circle,
            significance: CIRCLE_TO_SIGNIFICANCE[circle],
            identifiers: {
              emails: emailList,
              phones: phoneList,
              linkedinSlug: linkedinSlug.trim() || undefined,
              ...contact?.identifiers,
              ...(emailList.length > 0 ? { emails: emailList } : {}),
              ...(phoneList.length > 0 ? { phones: phoneList } : {}),
            },
            tags: tagList,
            notes: notes.trim() || undefined,
          }
          await onSave(updates)
        } else {
          const input: CreateContactInput = {
            displayName: displayName.trim(),
            firstName: firstName.trim() || undefined,
            lastName: lastName.trim() || undefined,
            title: title.trim() || undefined,
            company: company.trim() || undefined,
            relationship: relationship.trim() || undefined,
            circle,
            significance: CIRCLE_TO_SIGNIFICANCE[circle],
            identifiers: {
              emails: emailList,
              phones: phoneList,
              linkedinSlug: linkedinSlug.trim() || undefined,
            },
            tags: tagList,
            notes: notes.trim() || undefined,
            sources: ['manual'],
          }
          await onSave(input)
        }
        onClose()
      } catch (err) {
        console.error('Error saving contact:', err)
      } finally {
        setSaving(false)
      }
    },
    [
      displayName,
      firstName,
      lastName,
      title,
      company,
      relationship,
      circle,
      emails,
      phones,
      linkedinSlug,
      tags,
      notes,
      isEditing,
      contact,
      onSave,
      onClose,
    ]
  )

  const modalFooter = (
    <>
      <button type="button" className="contact-form__cancel-btn" onClick={onClose}>
        Cancel
      </button>
      <button
        type="submit"
        form="contact-form"
        className="contact-form__save-btn"
        disabled={!displayName.trim() || saving}
      >
        {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Contact'}
      </button>
    </>
  )

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={isEditing ? 'Edit Contact' : 'Add Contact'}
      footer={modalFooter}
    >
      <form id="contact-form" className="contact-form" onSubmit={handleSubmit}>
        <div className="contact-form__body">
          {/* Name */}
          <div className="contact-form__field">
            <label className="contact-form__label">Display Name *</label>
            <input
              className="contact-form__input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
              required
              autoFocus
            />
          </div>

          <div className="contact-form__row">
            <div className="contact-form__field">
              <label className="contact-form__label">First Name</label>
              <input
                className="contact-form__input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
              />
            </div>
            <div className="contact-form__field">
              <label className="contact-form__label">Last Name</label>
              <input
                className="contact-form__input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="contact-form__row">
            <div className="contact-form__field">
              <label className="contact-form__label">Title</label>
              <input
                className="contact-form__input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VP Engineering"
              />
            </div>
            <div className="contact-form__field">
              <label className="contact-form__label">Company</label>
              <input
                className="contact-form__input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Relationship</label>
            <input
              className="contact-form__input"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Mentor, Client, Co-founder..."
            />
          </div>

          {/* Circle */}
          <div className="contact-form__field">
            <label className="contact-form__label">Circle</label>
            <div className="contact-form__circle-row">
              {CIRCLES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`contact-form__circle-option${circle === c ? ' contact-form__circle-option--active' : ''}`}
                  onClick={() => setCircle(c)}
                >
                  {CIRCLE_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <hr className="contact-form__section-divider" />

          {/* Identifiers */}
          <div className="contact-form__field">
            <label className="contact-form__label">Email Addresses (comma-separated)</label>
            <input
              className="contact-form__input"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="jane@acme.com, janedoe@gmail.com"
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Phone Numbers (comma-separated)</label>
            <input
              className="contact-form__input"
              value={phones}
              onChange={(e) => setPhones(e.target.value)}
              placeholder="+1234567890"
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">LinkedIn Profile Slug</label>
            <input
              className="contact-form__input"
              value={linkedinSlug}
              onChange={(e) => setLinkedinSlug(e.target.value)}
              placeholder="janedoe"
            />
          </div>

          <hr className="contact-form__section-divider" />

          {/* Tags & Notes */}
          <div className="contact-form__field">
            <label className="contact-form__label">Tags (comma-separated)</label>
            <input
              className="contact-form__input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="mentor, tech, YC-batch-25"
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Notes</label>
            <textarea
              className="contact-form__textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Free-form notes about this contact..."
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}
