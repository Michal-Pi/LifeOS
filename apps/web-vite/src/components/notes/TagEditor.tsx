import { useState } from 'react'

interface TagEditorProps {
  tags: string[]
  onChange: (tags: string[]) => Promise<void> | void
  className?: string
}

export function TagEditor({ tags, onChange, className = '' }: TagEditorProps) {
  const [inputValue, setInputValue] = useState('')

  const addTag = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    const nextTags = Array.from(new Set([...tags, trimmed]))
    await onChange(nextTags)
    setInputValue('')
  }

  const removeTag = async (tag: string) => {
    const nextTags = tags.filter((t) => t !== tag)
    await onChange(nextTags)
  }

  return (
    <div className={`tag-editor ${className}`}>
      <div className="tag-editor-header">
        <span className="section-label">Tags</span>
      </div>
      <div className="tag-editor-body">
        <div className="tag-list">
          {tags.length === 0 ? (
            <span className="tag-empty">No tags</span>
          ) : (
            tags.map((tag) => (
              <span key={tag} className="tag-pill">
                {tag}
                <button
                  type="button"
                  className="tag-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              void addTag(inputValue)
            }
          }}
          onBlur={() => {
            if (inputValue.trim()) {
              void addTag(inputValue)
            }
          }}
          placeholder="Add a tag and press Enter"
          className="tag-input"
        />
      </div>

      <style>{`
        .tag-editor {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .tag-editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          min-height: 32px;
        }

        .tag-empty {
          font-size: 0.8125rem;
          color: var(--muted-foreground);
        }

        .tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--background-secondary);
          color: var(--foreground);
          padding: 0.25rem 0.5rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .tag-remove {
          border: none;
          background: transparent;
          color: var(--muted-foreground);
          cursor: pointer;
          font-size: 0.75rem;
          line-height: 1;
        }

        .tag-remove:hover {
          color: var(--foreground);
        }

        .tag-input {
          width: 100%;
          min-height: 36px;
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--background-secondary);
          color: var(--foreground);
          font-size: 0.8125rem;
        }

        .tag-input:focus-visible {
          outline: 2px solid transparent;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }
      `}</style>
    </div>
  )
}
