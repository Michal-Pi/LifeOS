/**
 * System Intervention Presets
 *
 * Built-in interventions for quick psychological regulation.
 * Based on CBT, ACT, physiological regulation, and Gestalt-inspired techniques.
 */

import type { CanonicalInterventionPreset } from './models'
import { asId } from '@lifeos/core'

/**
 * System-provided intervention presets
 * These are seeded into Firestore on first run
 */

// ----- Physiological Interventions -----

export const PHYSIOLOGICAL_SIGH: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-phys-sigh'),
  userId: 'system',
  type: 'physiological_sigh',
  title: 'Physiological Sigh',
  description:
    'Two inhales through nose, one long exhale through mouth. Scientifically proven to reduce stress in real-time.',
  defaultDurationSec: 30,
  tags: ['breathing', 'quick', 'stress'],
  recommendedForFeelings: ['anxious', 'overwhelmed', 'restless'],
  steps: [
    {
      kind: 'text',
      content:
        "The physiological sigh is one of the fastest ways to reduce stress.\n\nYou'll do 2-3 cycles of: double inhale through nose, long exhale through mouth.",
      durationSec: 5,
    },
    {
      kind: 'timer',
      instruction:
        'Breathe in deeply through your nose...\nThen take a quick second inhale (top up the lungs)...\nNow exhale slowly through your mouth.',
      durationSec: 10,
      showProgress: true,
    },
    {
      kind: 'text',
      content: 'Great. Repeat that 2 more times at your own pace.',
      durationSec: 15,
    },
    {
      kind: 'text',
      content:
        "Notice how your body feels now. You've just activated your parasympathetic nervous system.",
      durationSec: 5,
    },
  ],
}

export const BOX_BREATHING: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-box-breathing'),
  userId: 'system',
  type: 'box_breathing',
  title: 'Box Breathing (4-4-4-4)',
  description:
    'Inhale for 4, hold for 4, exhale for 4, hold for 4. Used by Navy SEALs for focus and calm.',
  defaultDurationSec: 45,
  tags: ['breathing', 'focus', 'calm'],
  recommendedForFeelings: ['anxious', 'restless', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content:
        'Box breathing creates calm and focus.\n\nFollow the pattern: Inhale (4s) → Hold (4s) → Exhale (4s) → Hold (4s).',
      durationSec: 5,
    },
    {
      kind: 'timer',
      instruction:
        'Breathe in... 2... 3... 4...\nHold... 2... 3... 4...\nBreathe out... 2... 3... 4...\nHold... 2... 3... 4...',
      durationSec: 32,
      showProgress: true,
    },
    {
      kind: 'text',
      content: 'You just completed 2 full cycles. Notice the steadiness in your body and mind.',
      durationSec: 5,
    },
  ],
}

export const BODY_SCAN_QUICK: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-body-scan'),
  userId: 'system',
  type: 'body_scan',
  title: 'Quick Body Scan',
  description: '60-second mindfulness body scan to ground yourself in the present moment.',
  defaultDurationSec: 60,
  tags: ['mindfulness', 'grounding', 'awareness'],
  recommendedForFeelings: ['anxious', 'restless', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: "Let's do a quick body scan to bring awareness to the present moment.",
      durationSec: 3,
    },
    {
      kind: 'timer',
      instruction:
        'Notice your feet on the ground... your back against the chair... your hands resting... your jaw... your shoulders.\n\nJust notice, without judgment.',
      durationSec: 40,
      showProgress: true,
    },
    {
      kind: 'text',
      content: "You're here, in this moment. That's enough.",
      durationSec: 5,
    },
  ],
}

// ----- CBT Interventions -----

export const CBT_THOUGHT_RECORD: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-cbt-thought'),
  userId: 'system',
  type: 'cbt_thought_record',
  title: 'Label the Thought Distortion',
  description:
    'Identify cognitive distortions (catastrophizing, mind reading, all-or-nothing thinking).',
  defaultDurationSec: 60,
  tags: ['CBT', 'thinking', 'awareness'],
  recommendedForFeelings: ['anxious', 'overwhelmed', 'angry'],
  steps: [
    {
      kind: 'input',
      prompt: 'What thought is bothering you right now?',
      placeholder: 'e.g., "I\'m going to fail this presentation"',
      multiline: true,
    },
    {
      kind: 'choice',
      question: 'Which cognitive distortion might this be?',
      options: [
        'Catastrophizing (imagining worst-case)',
        'Mind reading (assuming what others think)',
        'All-or-nothing thinking',
        'Overgeneralization',
        'Emotional reasoning',
        'None of these / Not sure',
      ],
      allowMultiple: false,
    },
    {
      kind: 'input',
      prompt: 'What would be a more balanced thought?',
      placeholder: "e.g., \"I've prepared well. Even if it's not perfect, I'll learn something.\"",
      multiline: true,
    },
    {
      kind: 'text',
      content: 'Good work. You just practiced cognitive reframing - a core CBT skill.',
    },
  ],
}

export const CBT_LIKELY_OUTCOME: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-cbt-outcome'),
  userId: 'system',
  type: 'cbt_likely_outcome',
  title: 'Best/Worst/Likely Outcome',
  description: 'Reality-test anxious thoughts by mapping best, worst, and most likely outcomes.',
  defaultDurationSec: 90,
  tags: ['CBT', 'anxiety', 'perspective'],
  recommendedForFeelings: ['anxious', 'overwhelmed'],
  steps: [
    {
      kind: 'input',
      prompt: 'What situation are you worried about?',
      placeholder: 'e.g., "Giving feedback to my team member"',
    },
    {
      kind: 'input',
      prompt: "What's the WORST that could realistically happen?",
      placeholder: 'They get defensive and the conversation is uncomfortable',
      multiline: true,
    },
    {
      kind: 'input',
      prompt: "What's the BEST that could happen?",
      placeholder: 'They appreciate the feedback and we build better trust',
      multiline: true,
    },
    {
      kind: 'input',
      prompt: "What's MOST LIKELY to happen?",
      placeholder: 'They listen, ask some questions, and we work through it',
      multiline: true,
    },
    {
      kind: 'text',
      content:
        'Notice how the most likely outcome is usually less extreme than what anxiety tells you.',
    },
    {
      kind: 'choice',
      question: 'What one action can you take now?',
      options: [
        'Prepare specific points for the conversation',
        'Schedule the conversation',
        'Ask a peer for advice',
        "Just move forward - I've thought it through",
        'Create a reminder to revisit this later',
      ],
    },
  ],
}

// ----- ACT Interventions -----

export const ACT_DEFUSION: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-act-defusion'),
  userId: 'system',
  type: 'act_defusion',
  title: 'Thought Defusion',
  description: 'Create distance from unhelpful thoughts using ACT\'s "I\'m noticing..." technique.',
  defaultDurationSec: 45,
  tags: ['ACT', 'mindfulness', 'thoughts'],
  recommendedForFeelings: ['anxious', 'overwhelmed', 'angry'],
  steps: [
    {
      kind: 'input',
      prompt: 'What thought keeps showing up?',
      placeholder: 'e.g., "I\'m not good enough"',
    },
    {
      kind: 'text',
      content: 'Now, rephrase that thought:\n\n"I\'m noticing I\'m having the thought that..."',
    },
    {
      kind: 'text',
      content:
        "This simple shift creates distance. You're not the thought - you're the observer of the thought.\n\nThoughts are just mental events passing through.",
    },
    {
      kind: 'text',
      content:
        'Can you let it be there, like a cloud passing in the sky, without needing to fight it or fix it?',
    },
  ],
}

export const ACT_VALUES_ACTION: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-act-values'),
  userId: 'system',
  type: 'act_values_action',
  title: 'Values-Aligned Action',
  description: 'Reconnect with your values and choose one small action aligned with them.',
  defaultDurationSec: 60,
  tags: ['ACT', 'values', 'meaning'],
  recommendedForFeelings: ['avoidant', 'tired', 'overwhelmed'],
  steps: [
    {
      kind: 'choice',
      question: 'Which value feels most important right now?',
      options: [
        'Health & vitality',
        'Connection & relationships',
        'Growth & learning',
        'Creativity & contribution',
        'Integrity & honesty',
        'Freedom & autonomy',
      ],
    },
    {
      kind: 'input',
      prompt: "What's one tiny action you could take in the next hour that aligns with that value?",
      placeholder: 'e.g., "Send a thank-you message to someone I appreciate"',
      multiline: true,
    },
    {
      kind: 'text',
      content:
        "Perfect. You don't need to feel motivated to act on your values. You can act first, and let meaning follow.",
    },
  ],
}

// ----- Gestalt-Inspired -----

export const GESTALT_PRESENT_AWARENESS: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-gestalt-now'),
  userId: 'system',
  type: 'gestalt_now',
  title: "What's True Right Now?",
  description: 'Gestalt-inspired grounding: separate fear from present reality.',
  defaultDurationSec: 45,
  tags: ['Gestalt', 'grounding', 'awareness'],
  recommendedForFeelings: ['anxious', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: "Let's separate the story from what's actually happening right now.",
    },
    {
      kind: 'input',
      prompt: 'What does your "Alarmist Voice" keep saying?',
      placeholder: 'e.g., "Everything is going to fall apart"',
      multiline: true,
    },
    {
      kind: 'input',
      prompt: 'Now: What is ACTUALLY true in this exact moment?',
      placeholder:
        'e.g., "I\'m sitting at my desk. I have a coffee. I\'m breathing. Nothing is on fire."',
      multiline: true,
    },
    {
      kind: 'text',
      content:
        "The alarmist voice is trying to protect you. But it's often preparing for a future that hasn't happened.\n\nYou're here. You're okay. You can handle the next right action.",
    },
  ],
}

// ----- Loving Kindness (Bonus) -----

export const LOVING_KINDNESS_BRIEF: Omit<
  CanonicalInterventionPreset,
  'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
> = {
  interventionId: asId('intervention:system-loving-kindness'),
  userId: 'system',
  type: 'loving_kindness',
  title: 'Brief Self-Compassion',
  description: 'Quick loving-kindness practice for self-compassion.',
  defaultDurationSec: 45,
  tags: ['compassion', 'kindness', 'self-care'],
  recommendedForFeelings: ['tired', 'angry', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: 'Place one hand on your heart. Take a breath.',
    },
    {
      kind: 'timer',
      instruction:
        'Silently repeat:\n\n"May I be safe."\n"May I be peaceful."\n"May I be kind to myself."\n"May I accept myself as I am."',
      durationSec: 30,
      showProgress: true,
    },
    {
      kind: 'text',
      content: 'You deserve compassion - especially from yourself.',
    },
  ],
}

// ----- Export All System Presets -----

export const SYSTEM_INTERVENTION_PRESETS = [
  PHYSIOLOGICAL_SIGH,
  BOX_BREATHING,
  BODY_SCAN_QUICK,
  CBT_THOUGHT_RECORD,
  CBT_LIKELY_OUTCOME,
  ACT_DEFUSION,
  ACT_VALUES_ACTION,
  GESTALT_PRESENT_AWARENESS,
  LOVING_KINDNESS_BRIEF,
]

/**
 * Helper to add timestamps and sync state to system presets
 */
export function hydrateSystemPreset(
  preset: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'>
): CanonicalInterventionPreset {
  const now = Date.now()
  return {
    ...preset,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }
}
