import { describe, expect, it } from 'vitest'

import { safeParseJson } from '../jsonParser.js'

describe('safeParseJson', () => {
  it('parses objects with trailing commas', () => {
    const parsed = safeParseJson<{ claims: Array<{ id: string }> }>(`{
      "claims": [
        { "id": "CLM-001" },
        { "id": "CLM-002" },
      ],
    }`)

    expect(parsed).toEqual({
      claims: [{ id: 'CLM-001' }, { id: 'CLM-002' }],
    })
  })

  it('parses arrays with trailing commas inside markdown fences', () => {
    const parsed = safeParseJson<Array<{ id: string }>>(
      '```json\n' +
        '[\n' +
        '  { "id": "A" },\n' +
        '  { "id": "B" },\n' +
        ']\n' +
        '```'
    )

    expect(parsed).toEqual([{ id: 'A' }, { id: 'B' }])
  })
})
