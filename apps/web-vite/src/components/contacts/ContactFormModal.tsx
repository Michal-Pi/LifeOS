/**
 * ContactFormModal — create/edit contact form with LinkedIn search enrichment
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  Contact,
  DunbarCircle,
  CreateContactInput,
  UpdateContactInput,
  WorkHistoryEntry,
  RelationshipType,
  PipelineEntry,
  ContactTask,
} from '@lifeos/agents'
import { CIRCLE_LABELS, CIRCLE_TO_SIGNIFICANCE, RELATIONSHIP_TYPES, RELATIONSHIP_LABELS } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import '@/styles/components/ContactFormModal.css'

interface ContactFormModalProps {
  contact?: Contact | null
  onSave: (data: CreateContactInput | UpdateContactInput) => Promise<void>
  onClose: () => void
}

interface LinkedInSearchResult {
  publicIdentifier: string
  firstName: string
  lastName: string
  headline?: string
  profilePicture?: string
}

interface LinkedInProfileData {
  firstName: string
  lastName: string
  headline?: string
  industry?: string
  location?: string
  profilePicture?: string
  positions?: Array<{
    title: string
    companyName: string
    startDate?: { month?: number; year?: number }
    endDate?: { month?: number; year?: number }
    current?: boolean
  }>
}

interface WorkHistoryForm {
  company: string
  title: string
  startDate: string
  endDate: string
  current: boolean
}

interface PipelineForm {
  projectName: string
  type: string
  stage: string
}

interface TaskForm {
  action: string
  dueDate: string
  priority: string
  status: string
  reason: string
}

const CIRCLES: DunbarCircle[] = [0, 1, 2, 3, 4]

export function ContactFormModal({ contact, onSave, onClose }: ContactFormModalProps) {
  const { user } = useAuth()
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
  const [dateOfBirth, setDateOfBirth] = useState(contact?.dateOfBirth ?? '')
  const [workHistory, setWorkHistory] = useState<WorkHistoryForm[]>(
    contact?.workHistory?.map((wh) => ({
      company: wh.company,
      title: wh.title,
      startDate: wh.startDate ?? '',
      endDate: wh.endDate ?? '',
      current: wh.current ?? false,
    })) ?? []
  )
  const [howWeMet, setHowWeMet] = useState(contact?.howWeMet ?? '')

  // Personal context
  const [interests, setInterests] = useState(contact?.interests?.join(', ') ?? '')
  const [familyNotes, setFamilyNotes] = useState(contact?.familyNotes ?? '')
  const [personalityStyle, setPersonalityStyle] = useState(contact?.personalityStyle ?? '')
  const [preferences, setPreferences] = useState(contact?.preferences ?? '')

  // Professional context
  const [goals, setGoals] = useState(contact?.goals ?? '')
  const [challenges, setChallenges] = useState(contact?.challenges ?? '')
  const [strategicPriorities, setStrategicPriorities] = useState(contact?.strategicPriorities ?? '')

  // Pipeline
  const [pipeline, setPipeline] = useState<PipelineForm[]>(
    contact?.pipeline?.map((p) => ({
      projectName: p.projectName,
      type: p.type ?? '',
      stage: p.stage ?? '',
    })) ?? []
  )

  // Tasks
  const [contactTasks, setContactTasks] = useState<TaskForm[]>(
    contact?.contactTasks?.map((t) => ({
      action: t.action,
      dueDate: t.dueDate ?? '',
      priority: t.priority ?? '',
      status: t.status,
      reason: t.reason ?? '',
    })) ?? []
  )

  const [saving, setSaving] = useState(false)

  const prefillNamesFromEmail = useCallback(
    (emailsValue: string) => {
      if (firstName || lastName || displayName) return
      const first = emailsValue.split(',')[0]?.trim().toLowerCase()
      if (!first) return
      const match = first.match(/^([a-z]+)\.([a-z]+)@.+\..+$/)
      if (!match) return
      const fn = match[1].charAt(0).toUpperCase() + match[1].slice(1)
      const ln = match[2].charAt(0).toUpperCase() + match[2].slice(1)
      setFirstName(fn)
      setLastName(ln)
      setDisplayName(`${fn} ${ln}`)
    },
    [firstName, lastName, displayName]
  )

  // LinkedIn search state
  const [showLinkedInSearch, setShowLinkedInSearch] = useState(false)
  const [linkedinQuery, setLinkedinQuery] = useState('')
  const [linkedinResults, setLinkedinResults] = useState<LinkedInSearchResult[]>([])
  const [linkedinSearching, setLinkedinSearching] = useState(false)
  const [linkedinError, setLinkedinError] = useState<string | null>(null)
  const [linkedinFetching, setLinkedinFetching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced LinkedIn search
  useEffect(() => {
    if (!linkedinQuery.trim() || linkedinQuery.trim().length < 2) {
      setLinkedinResults([])
      return
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    searchTimerRef.current = setTimeout(async () => {
      if (!user) return
      setLinkedinSearching(true)
      setLinkedinError(null)
      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/linkedinProfileSearch`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ uid: user.uid, query: linkedinQuery.trim() }),
          }
        )
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || 'Search failed')
        }
        const data = await response.json()
        setLinkedinResults(data.results ?? [])
      } catch (err) {
        setLinkedinError((err as Error).message)
        setLinkedinResults([])
      } finally {
        setLinkedinSearching(false)
      }
    }, 400)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [linkedinQuery, user])

  // Select a LinkedIn profile and fetch full details
  const handleLinkedInSelect = useCallback(
    async (result: LinkedInSearchResult) => {
      if (!user) return
      setLinkedinFetching(true)
      setLinkedinError(null)
      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/linkedinProfileSearch`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: user.uid,
              publicIdentifier: result.publicIdentifier,
            }),
          }
        )
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to fetch profile')
        }
        const data = (await response.json()) as { profile: LinkedInProfileData }
        const profile = data.profile

        // Auto-populate form fields
        setFirstName(profile.firstName || result.firstName)
        setLastName(profile.lastName || result.lastName)
        setDisplayName(`${profile.firstName || result.firstName} ${profile.lastName || result.lastName}`)
        setLinkedinSlug(result.publicIdentifier)

        if (profile.positions && profile.positions.length > 0) {
          const currentPos = profile.positions.find((p) => p.current)
          if (currentPos) {
            setTitle(currentPos.title)
            setCompany(currentPos.companyName)
          }

          setWorkHistory(
            profile.positions.map((p) => ({
              title: p.title,
              company: p.companyName,
              startDate: p.startDate
                ? `${p.startDate.year}-${String(p.startDate.month ?? 1).padStart(2, '0')}-01`
                : '',
              endDate:
                p.current || !p.endDate
                  ? ''
                  : `${p.endDate.year}-${String(p.endDate.month ?? 1).padStart(2, '0')}-01`,
              current: p.current ?? false,
            }))
          )
        } else if (result.headline) {
          // Fall back to headline parsing
          const parts = result.headline.split(' at ')
          if (parts.length === 2) {
            setTitle(parts[0].trim())
            setCompany(parts[1].trim())
          }
        }

        // Close search
        setShowLinkedInSearch(false)
        setLinkedinQuery('')
        setLinkedinResults([])
      } catch (err) {
        setLinkedinError((err as Error).message)
      } finally {
        setLinkedinFetching(false)
      }
    },
    [user]
  )

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

        const workHistoryClean: WorkHistoryEntry[] = workHistory
          .filter((wh) => wh.company || wh.title)
          .map((wh) => ({
            company: wh.company,
            title: wh.title,
            startDate: wh.startDate || undefined,
            endDate: wh.current ? undefined : wh.endDate || undefined,
            current: wh.current || undefined,
          }))

        const interestList = interests
          .split(',')
          .map((i) => i.trim())
          .filter(Boolean)

        const pipelineClean: PipelineEntry[] = pipeline
          .filter((p) => p.projectName.trim())
          .map((p) => ({
            projectName: p.projectName.trim(),
            type: p.type.trim() || undefined,
            stage: p.stage.trim() || undefined,
          }))

        const tasksClean: ContactTask[] = contactTasks
          .filter((t) => t.action.trim())
          .map((t) => ({
            action: t.action.trim(),
            dueDate: t.dueDate || undefined,
            priority: (t.priority as ContactTask['priority']) || undefined,
            status: (t.status as ContactTask['status']) || 'pending',
            reason: t.reason.trim() || undefined,
          }))

        const sharedFields = {
          displayName: displayName.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          title: title.trim() || undefined,
          company: company.trim() || undefined,
          relationship: (relationship as RelationshipType) || undefined,
          howWeMet: howWeMet.trim() || undefined,
          circle,
          significance: CIRCLE_TO_SIGNIFICANCE[circle],
          tags: tagList,
          notes: notes.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          workHistory: workHistoryClean.length > 0 ? workHistoryClean : undefined,
          interests: interestList.length > 0 ? interestList : undefined,
          familyNotes: familyNotes.trim() || undefined,
          personalityStyle: personalityStyle.trim() || undefined,
          preferences: preferences.trim() || undefined,
          goals: goals.trim() || undefined,
          challenges: challenges.trim() || undefined,
          strategicPriorities: strategicPriorities.trim() || undefined,
          pipeline: pipelineClean.length > 0 ? pipelineClean : undefined,
          contactTasks: tasksClean.length > 0 ? tasksClean : undefined,
        }

        if (isEditing) {
          const updates: UpdateContactInput = {
            ...sharedFields,
            identifiers: {
              emails: emailList,
              phones: phoneList,
              linkedinSlug: linkedinSlug.trim() || undefined,
              ...contact?.identifiers,
              ...(emailList.length > 0 ? { emails: emailList } : {}),
              ...(phoneList.length > 0 ? { phones: phoneList } : {}),
            },
          }
          await onSave(updates)
        } else {
          const input: CreateContactInput = {
            ...sharedFields,
            identifiers: {
              emails: emailList,
              phones: phoneList,
              linkedinSlug: linkedinSlug.trim() || undefined,
            },
            sources: linkedinSlug ? ['linkedin', 'manual'] : ['manual'],
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
      howWeMet,
      circle,
      emails,
      phones,
      linkedinSlug,
      tags,
      notes,
      dateOfBirth,
      workHistory,
      interests,
      familyNotes,
      personalityStyle,
      preferences,
      goals,
      challenges,
      strategicPriorities,
      pipeline,
      contactTasks,
      isEditing,
      contact,
      onSave,
      onClose,
    ]
  )

  const handleAddWorkEntry = useCallback(() => {
    setWorkHistory((prev) => [
      ...prev,
      { company: '', title: '', startDate: '', endDate: '', current: false },
    ])
  }, [])

  const handleUpdateWorkEntry = useCallback(
    (index: number, field: keyof WorkHistoryForm, value: string | boolean) => {
      setWorkHistory((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], [field]: value }
        if (field === 'current' && value) {
          updated[index].endDate = ''
        }
        return updated
      })
    },
    []
  )

  const handleRemoveWorkEntry = useCallback((index: number) => {
    setWorkHistory((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Pipeline handlers
  const handleAddPipeline = useCallback(() => {
    setPipeline((prev) => [...prev, { projectName: '', type: '', stage: '' }])
  }, [])

  const handleUpdatePipeline = useCallback(
    (index: number, field: keyof PipelineForm, value: string) => {
      setPipeline((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], [field]: value }
        return updated
      })
    },
    []
  )

  const handleRemovePipeline = useCallback((index: number) => {
    setPipeline((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Task handlers
  const handleAddTask = useCallback(() => {
    setContactTasks((prev) => [
      ...prev,
      { action: '', dueDate: '', priority: '', status: 'pending', reason: '' },
    ])
  }, [])

  const handleUpdateTask = useCallback(
    (index: number, field: keyof TaskForm, value: string) => {
      setContactTasks((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], [field]: value }
        return updated
      })
    },
    []
  )

  const handleRemoveTask = useCallback((index: number) => {
    setContactTasks((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const modalFooter = (
    <>
      <button type="button" className="ghost-button" onClick={onClose}>
        Cancel
      </button>
      <button
        type="submit"
        form="contact-form"
        className="primary-button"
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
          {/* LinkedIn Search */}
          <div className="contact-form__linkedin-section">
            {!showLinkedInSearch ? (
              <button
                type="button"
                className="ghost-button small"
                onClick={() => setShowLinkedInSearch(true)}
              >
                <span className="contact-form__linkedin-icon">in</span> Add from LinkedIn
              </button>
            ) : (
              <div className="contact-form__linkedin-search">
                <div className="contact-form__linkedin-search-header">
                  <input
                    className="contact-form__input"
                    type="text"
                    placeholder="Search LinkedIn profiles..."
                    value={linkedinQuery}
                    onChange={(e) => setLinkedinQuery(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => {
                      setShowLinkedInSearch(false)
                      setLinkedinQuery('')
                      setLinkedinResults([])
                      setLinkedinError(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>

                {linkedinSearching && (
                  <div className="contact-form__linkedin-status">Searching...</div>
                )}
                {linkedinFetching && (
                  <div className="contact-form__linkedin-status">Loading profile...</div>
                )}
                {linkedinError && (
                  <div className="contact-form__linkedin-error">{linkedinError}</div>
                )}

                {linkedinResults.length > 0 && (
                  <div className="contact-form__linkedin-results">
                    {linkedinResults.map((r) => (
                      <button
                        key={r.publicIdentifier}
                        type="button"
                        className="contact-form__linkedin-result"
                        onClick={() => handleLinkedInSelect(r)}
                        disabled={linkedinFetching}
                      >
                        <div className="contact-form__linkedin-result-avatar">
                          {r.profilePicture ? (
                            <img src={r.profilePicture} alt="" />
                          ) : (
                            `${r.firstName[0] ?? ''}${r.lastName[0] ?? ''}`.toUpperCase()
                          )}
                        </div>
                        <div className="contact-form__linkedin-result-info">
                          <div className="contact-form__linkedin-result-name">
                            {r.firstName} {r.lastName}
                          </div>
                          {r.headline && (
                            <div className="contact-form__linkedin-result-headline">
                              {r.headline}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <hr className="contact-form__section-divider" />

          {/* Name */}
          <div className="contact-form__field">
            <label className="contact-form__label">Display Name *</label>
            <input
              className="contact-form__input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
              required
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

          <div className="contact-form__row">
            <div className="contact-form__field">
              <label className="contact-form__label">Relationship</label>
              <select
                className="contact-form__select"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
              >
                <option value="">Select...</option>
                {RELATIONSHIP_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {RELATIONSHIP_LABELS[rt]}
                  </option>
                ))}
              </select>
            </div>
            <div className="contact-form__field">
              <label className="contact-form__label">Date of Birth</label>
              <input
                className="contact-form__input"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">How We Met</label>
            <input
              className="contact-form__input"
              value={howWeMet}
              onChange={(e) => setHowWeMet(e.target.value)}
              placeholder="Conference, introduction from..."
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
              onBlur={() => prefillNamesFromEmail(emails)}
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

          {/* Work History */}
          <div className="contact-form__field">
            <label className="contact-form__label">Work History</label>
            {workHistory.map((wh, index) => (
              <div key={index} className="contact-form__work-entry">
                <div className="contact-form__row">
                  <input
                    className="contact-form__input"
                    placeholder="Title"
                    value={wh.title}
                    onChange={(e) => handleUpdateWorkEntry(index, 'title', e.target.value)}
                  />
                  <input
                    className="contact-form__input"
                    placeholder="Company"
                    value={wh.company}
                    onChange={(e) => handleUpdateWorkEntry(index, 'company', e.target.value)}
                  />
                </div>
                <div className="contact-form__row">
                  <input
                    className="contact-form__input"
                    type="date"
                    value={wh.startDate}
                    onChange={(e) => handleUpdateWorkEntry(index, 'startDate', e.target.value)}
                  />
                  <input
                    className="contact-form__input"
                    type="date"
                    value={wh.endDate}
                    disabled={wh.current}
                    onChange={(e) => handleUpdateWorkEntry(index, 'endDate', e.target.value)}
                  />
                </div>
                <div className="contact-form__work-entry-actions">
                  <label className="contact-form__work-current-label">
                    <input
                      type="checkbox"
                      checked={wh.current}
                      onChange={(e) => handleUpdateWorkEntry(index, 'current', e.target.checked)}
                    />{' '}
                    Current
                  </label>
                  <button
                    type="button"
                    className="ghost-button small danger"
                    onClick={() => handleRemoveWorkEntry(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="ghost-button small" onClick={handleAddWorkEntry}>
              + Add Position
            </button>
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

          <hr className="contact-form__section-divider" />

          {/* Personal Context */}
          <div className="contact-form__section-header">Personal Context</div>

          <div className="contact-form__field">
            <label className="contact-form__label">Interests (comma-separated)</label>
            <input
              className="contact-form__input"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="Running, AI research, cooking..."
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Family Notes</label>
            <textarea
              className="contact-form__textarea"
              value={familyNotes}
              onChange={(e) => setFamilyNotes(e.target.value)}
              placeholder="Spouse, kids, family context..."
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Personality / Communication Style</label>
            <textarea
              className="contact-form__textarea"
              value={personalityStyle}
              onChange={(e) => setPersonalityStyle(e.target.value)}
              placeholder="Direct communicator, prefers email..."
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Preferences</label>
            <textarea
              className="contact-form__textarea"
              value={preferences}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="Preferred meeting times, communication preferences..."
            />
          </div>

          <hr className="contact-form__section-divider" />

          {/* Professional Context */}
          <div className="contact-form__section-header">Professional Context</div>

          <div className="contact-form__field">
            <label className="contact-form__label">Goals / Priorities</label>
            <textarea
              className="contact-form__textarea"
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder="Current professional goals..."
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Current Challenges</label>
            <textarea
              className="contact-form__textarea"
              value={challenges}
              onChange={(e) => setChallenges(e.target.value)}
              placeholder="Problems they're trying to solve..."
            />
          </div>

          <div className="contact-form__field">
            <label className="contact-form__label">Strategic Priorities</label>
            <textarea
              className="contact-form__textarea"
              value={strategicPriorities}
              onChange={(e) => setStrategicPriorities(e.target.value)}
              placeholder="Key strategic focus areas..."
            />
          </div>

          <hr className="contact-form__section-divider" />

          {/* Pipeline */}
          <div className="contact-form__field">
            <label className="contact-form__label">Pipeline</label>
            {pipeline.map((entry, index) => (
              <div key={index} className="contact-form__pipeline-entry">
                <input
                  className="contact-form__input"
                  placeholder="Project Name"
                  value={entry.projectName}
                  onChange={(e) => handleUpdatePipeline(index, 'projectName', e.target.value)}
                />
                <div className="contact-form__row">
                  <input
                    className="contact-form__input"
                    placeholder="Type (deal, partnership...)"
                    value={entry.type}
                    onChange={(e) => handleUpdatePipeline(index, 'type', e.target.value)}
                  />
                  <select
                    className="contact-form__select"
                    value={entry.stage}
                    onChange={(e) => handleUpdatePipeline(index, 'stage', e.target.value)}
                  >
                    <option value="">Stage...</option>
                    <option value="lead">Lead</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="closed">Closed</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="ghost-button small danger"
                  onClick={() => handleRemovePipeline(index)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="ghost-button small" onClick={handleAddPipeline}>
              + Add Pipeline Entry
            </button>
          </div>

          <hr className="contact-form__section-divider" />

          {/* Tasks & Follow-ups */}
          <div className="contact-form__field">
            <label className="contact-form__label">Tasks & Follow-ups</label>
            {contactTasks.map((task, index) => (
              <div key={index} className="contact-form__task-entry">
                <input
                  className="contact-form__input"
                  placeholder="Action / Next step"
                  value={task.action}
                  onChange={(e) => handleUpdateTask(index, 'action', e.target.value)}
                />
                <div className="contact-form__row">
                  <input
                    className="contact-form__input"
                    type="date"
                    value={task.dueDate}
                    onChange={(e) => handleUpdateTask(index, 'dueDate', e.target.value)}
                  />
                  <select
                    className="contact-form__select"
                    value={task.priority}
                    onChange={(e) => handleUpdateTask(index, 'priority', e.target.value)}
                  >
                    <option value="">Priority...</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    className="contact-form__select"
                    value={task.status}
                    onChange={(e) => handleUpdateTask(index, 'status', e.target.value)}
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <input
                  className="contact-form__input"
                  placeholder="Reason for follow-up"
                  value={task.reason}
                  onChange={(e) => handleUpdateTask(index, 'reason', e.target.value)}
                />
                <button
                  type="button"
                  className="ghost-button small danger"
                  onClick={() => handleRemoveTask(index)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="ghost-button small" onClick={handleAddTask}>
              + Add Task
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
