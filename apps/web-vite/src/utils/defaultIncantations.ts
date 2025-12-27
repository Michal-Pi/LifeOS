import type { CreateIncantationInput } from '@lifeos/habits'

/**
 * Default incantations based on the PRD:
 * - Identity + action ("I'm someone who shows up imperfectly.")
 * - Values-based ("I protect sleep because freedom/health.")
 * - Self-compassion ("This is hard; one action still counts.")
 */

export const DEFAULT_INCANTATIONS: Omit<CreateIncantationInput, 'userId'>[] = [
  // Identity + Action
  {
    type: 'identity_action',
    text: "I'm someone who shows up imperfectly.",
    active: true,
  },
  {
    type: 'identity_action',
    text: 'I am building the person I want to become, one small action at a time.',
    active: true,
  },
  {
    type: 'identity_action',
    text: 'I choose progress over perfection.',
    active: true,
  },

  // Values-based
  {
    type: 'values',
    text: 'I protect my sleep because it enables freedom and health.',
    domains: ['sleep'],
    active: true,
  },
  {
    type: 'values',
    text: 'I move my body because physical vitality fuels everything I care about.',
    domains: ['exercise'],
    active: true,
  },
  {
    type: 'values',
    text: 'I practice mindfulness because clarity and calm are prerequisites for my best work.',
    domains: ['meditation'],
    active: true,
  },

  // Self-compassion
  {
    type: 'self_compassion',
    text: 'This is hard, and one small action still counts.',
    active: true,
  },
  {
    type: 'self_compassion',
    text: 'Missing once is data. Missing twice is human. Showing up again is strength.',
    active: true,
  },
  {
    type: 'self_compassion',
    text: "I don't need to feel motivated to take one tiny step.",
    active: true,
  },
  {
    type: 'self_compassion',
    text: 'The tiny version counts. Always.',
    active: true,
  },
]
