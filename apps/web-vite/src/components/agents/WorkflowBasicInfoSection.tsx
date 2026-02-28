/**
 * WorkflowBasicInfoSection
 *
 * Form fields for workflow name and description.
 */

import type { BasicInfoSectionProps } from './workflowFormConstants'

export function WorkflowBasicInfoSection({
  name,
  setName,
  description,
  setDescription,
  validationErrors,
  setValidationErrors,
}: BasicInfoSectionProps) {
  return (
    <>
      <div className="form-group">
        <label htmlFor="name">Workflow Name *</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (validationErrors.name) {
              const { name: _, ...rest } = validationErrors
              setValidationErrors(rest)
            }
          }}
          placeholder="e.g., Fitness Assistant"
          required
          className={validationErrors.name ? 'error' : ''}
        />
        {validationErrors.name && <span className="field-error">{validationErrors.name}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this workflow do?"
          rows={3}
        />
      </div>
    </>
  )
}
