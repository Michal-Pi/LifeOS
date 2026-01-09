/**
 * TopicSidebar Component
 *
 * Hierarchical navigation for Topics and Sections.
 * Allows creating, editing, deleting topics and sections.
 */

import { useState } from 'react'
import { useTopics } from '@/hooks/useTopics'
import { useSections } from '@/hooks/useSections'
import type { TopicId, SectionId } from '@lifeos/notes'
import { useDialog } from '@/contexts/useDialog'

export interface TopicSidebarProps {
  selectedTopicId?: TopicId | null
  selectedSectionId?: SectionId | null
  onTopicSelect: (topicId: TopicId | null) => void
  onSectionSelect: (sectionId: SectionId | null, topicId: TopicId | null) => void
}

export function TopicSidebar({
  selectedTopicId,
  selectedSectionId,
  onTopicSelect,
  onSectionSelect,
}: TopicSidebarProps) {
  const { confirm } = useDialog()
  const { topics, isLoading: topicsLoading, createTopic, deleteTopic } = useTopics()
  const { sections, createSection, deleteSection } = useSections(selectedTopicId || undefined)

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set())
  const [newTopicName, setNewTopicName] = useState('')
  const [showTopicInput, setShowTopicInput] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [showSectionInput, setShowSectionInput] = useState<string | null>(null)

  const toggleTopic = (topicId: TopicId) => {
    const newExpanded = new Set(expandedTopics)
    if (newExpanded.has(topicId)) {
      newExpanded.delete(topicId)
    } else {
      newExpanded.add(topicId)
    }
    setExpandedTopics(newExpanded)
  }

  const handleCreateTopic = async () => {
    if (!newTopicName.trim()) return

    try {
      await createTopic({
        name: newTopicName,
        order: topics.length,
      })
      setNewTopicName('')
      setShowTopicInput(false)
    } catch (error) {
      console.error('Failed to create topic:', error)
    }
  }

  const handleDeleteTopic = async (topicId: TopicId, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = await confirm({
      title: 'Delete topic',
      description: 'Delete this topic and all its sections?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    try {
      await deleteTopic(topicId)
      if (selectedTopicId === topicId) {
        onTopicSelect(null)
      }
    } catch (error) {
      console.error('Failed to delete topic:', error)
    }
  }

  const handleCreateSection = async (topicId: TopicId) => {
    if (!newSectionName.trim()) return

    try {
      await createSection({
        topicId,
        name: newSectionName,
        order: sections.length,
      })
      setNewSectionName('')
      setShowSectionInput(null)
    } catch (error) {
      console.error('Failed to create section:', error)
    }
  }

  const handleDeleteSection = async (sectionId: SectionId, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = await confirm({
      title: 'Delete section',
      description: 'Delete this section?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    try {
      await deleteSection(sectionId)
      if (selectedSectionId === sectionId) {
        onSectionSelect(null, null)
      }
    } catch (error) {
      console.error('Failed to delete section:', error)
    }
  }

  return (
    <div className="topic-sidebar">
      <div className="sidebar-header">
        <h2>Organization</h2>
        <button
          onClick={() => setShowTopicInput(true)}
          className="btn-icon"
          title="New Topic"
          aria-label="Create new topic"
        >
          +
        </button>
      </div>

      {/* All Notes */}
      <div
        className={`sidebar-item ${!selectedTopicId && !selectedSectionId ? 'active' : ''}`}
        onClick={() => {
          onTopicSelect(null)
          onSectionSelect(null, null)
        }}
      >
        <span className="item-icon">📄</span>
        <span>All Notes</span>
      </div>

      {/* New Topic Input */}
      {showTopicInput && (
        <div className="new-item-input">
          <input
            type="text"
            placeholder="Topic name..."
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateTopic()
              if (e.key === 'Escape') {
                setShowTopicInput(false)
                setNewTopicName('')
              }
            }}
            autoFocus
          />
          <button onClick={handleCreateTopic} className="btn-sm">
            Add
          </button>
          <button
            onClick={() => {
              setShowTopicInput(false)
              setNewTopicName('')
            }}
            className="btn-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Topics List */}
      {topicsLoading && <p className="loading">Loading topics...</p>}
      {topics.map((topic) => {
        const isExpanded = expandedTopics.has(topic.topicId)
        const topicSections = sections.filter((s) => s.topicId === topic.topicId)

        return (
          <div key={topic.topicId} className="topic-group">
            <div
              className={`sidebar-item topic-item ${selectedTopicId === topic.topicId && !selectedSectionId ? 'active' : ''}`}
              onClick={() => {
                onTopicSelect(topic.topicId)
                onSectionSelect(null, topic.topicId)
              }}
            >
              <span
                className="expand-icon"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleTopic(topic.topicId)
                }}
              >
                {isExpanded ? '▼' : '▶'}
              </span>
              <span className="item-icon">📁</span>
              <span className="item-name">{topic.name}</span>
              <div className="item-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowSectionInput(topic.topicId)
                  }}
                  className="btn-icon-sm"
                  title="New Section"
                  aria-label="Create new section"
                >
                  +
                </button>
                <button
                  onClick={(e) => handleDeleteTopic(topic.topicId, e)}
                  className="btn-icon-sm delete"
                  title="Delete Topic"
                  aria-label="Delete topic"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Sections */}
            {isExpanded && (
              <div className="sections-list">
                {/* New Section Input */}
                {showSectionInput === topic.topicId && (
                  <div className="new-item-input section-input">
                    <input
                      type="text"
                      placeholder="Section name..."
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateSection(topic.topicId)
                        if (e.key === 'Escape') {
                          setShowSectionInput(null)
                          setNewSectionName('')
                        }
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleCreateSection(topic.topicId)} className="btn-sm">
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowSectionInput(null)
                        setNewSectionName('')
                      }}
                      className="btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {topicSections.map((section) => (
                  <div
                    key={section.sectionId}
                    className={`sidebar-item section-item ${selectedSectionId === section.sectionId ? 'active' : ''}`}
                    onClick={() => onSectionSelect(section.sectionId, topic.topicId)}
                  >
                    <span className="item-icon">📑</span>
                    <span className="item-name">{section.name}</span>
                    <button
                      onClick={(e) => handleDeleteSection(section.sectionId, e)}
                      className="btn-icon-sm delete"
                      title="Delete Section"
                      aria-label="Delete section"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <style>{`
        .topic-sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
          border-right: 1px solid var(--border);
          padding: 16px;
          background: var(--background);
        }

        .sidebar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .sidebar-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .btn-icon {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }

        .btn-icon:hover {
          border-color: var(--border-strong);
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 10px;
          cursor: pointer;
          user-select: none;
          position: relative;
          border: 1px solid transparent;
          transition:
            border-color var(--motion-fast) var(--motion-ease),
            box-shadow var(--motion-fast) var(--motion-ease);
        }

        .sidebar-item:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent-subtle);
        }

        .sidebar-item.active {
          border-color: var(--accent);
          color: var(--foreground);
          box-shadow: 0 0 0 1px var(--accent-subtle);
        }

        .expand-icon {
          width: 16px;
          font-size: 10px;
          cursor: pointer;
        }

        .item-icon {
          font-size: 16px;
        }

        .item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .item-actions {
          display: none;
          gap: 4px;
        }

        .sidebar-item:hover .item-actions {
          display: flex;
        }

        .btn-icon-sm {
          width: 20px;
          height: 20px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-icon-sm:hover {
          background: var(--background-tertiary);
        }

        .btn-icon-sm.delete:hover {
          background: var(--error-light);
          color: var(--error);
        }

        .topic-group {
          margin-bottom: 4px;
        }

        .sections-list {
          margin-left: 20px;
        }

        .section-item {
          margin-bottom: 2px;
        }

        .new-item-input {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
          padding: 8px;
          background: var(--background-secondary);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .new-item-input.section-input {
          margin-left: 20px;
        }

        .new-item-input input {
          flex: 1;
          padding: 0 8px;
          height: 32px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: transparent;
          color: var(--foreground);
          font-size: 14px;
          transition:
            border-color var(--motion-standard) var(--motion-ease),
            box-shadow var(--motion-standard) var(--motion-ease);
        }

        .new-item-input input:focus-visible {
          outline: 2px solid transparent;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .btn-sm {
          padding: 6px 12px;
          border: 1px solid var(--accent);
          border-radius: 10px;
          background: transparent;
          color: var(--accent);
          cursor: pointer;
          font-size: 12px;
          transition: box-shadow var(--motion-standard) var(--motion-ease);
        }

        .btn-sm:hover {
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .loading {
          color: var(--muted-foreground);
          font-size: 14px;
          padding: 8px 12px;
        }
      `}</style>
    </div>
  )
}
