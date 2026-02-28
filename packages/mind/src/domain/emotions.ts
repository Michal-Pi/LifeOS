/**
 * Feelings Wheel Emotion Taxonomy
 *
 * Based on the Feelings Wheel model with core emotions in the center
 * and progressively more specific emotions in outer rings.
 */

import type { Id } from '@lifeos/core'

// ----- IDs -----

export type CheckInId = Id<'checkin'>

// ----- Emotion Classification -----

export type EnergyLevel = 'low' | 'medium' | 'high'
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

// ----- Core Emotion Type -----

export type CoreEmotionId =
  | 'happy'
  | 'sad'
  | 'disgusted'
  | 'angry'
  | 'fearful'
  | 'neutral'
  | 'bad'
  | 'surprised'

// ----- Detailed Emotion (outer ring) -----

export interface DetailedEmotion {
  id: string
  label: string
  coreEmotionId: CoreEmotionId
}

// ----- Core Emotion Definition -----

export interface CoreEmotion {
  id: CoreEmotionId
  label: string
  color: string // HSL color for the wheel segment
  detailedEmotions: DetailedEmotion[]
}

// ----- Feelings Wheel Data -----

export const FEELINGS_WHEEL: CoreEmotion[] = [
  // Positive → Neutral → Negative
  {
    id: 'happy',
    label: 'Happy',
    color: 'hsl(48, 95%, 55%)', // Yellow
    detailedEmotions: [
      { id: 'playful', label: 'Playful', coreEmotionId: 'happy' },
      { id: 'aroused', label: 'Aroused', coreEmotionId: 'happy' },
      { id: 'cheeky', label: 'Cheeky', coreEmotionId: 'happy' },
      { id: 'content', label: 'Content', coreEmotionId: 'happy' },
      { id: 'free', label: 'Free', coreEmotionId: 'happy' },
      { id: 'joyful', label: 'Joyful', coreEmotionId: 'happy' },
      { id: 'curious', label: 'Curious', coreEmotionId: 'happy' },
      { id: 'inquisitive', label: 'Inquisitive', coreEmotionId: 'happy' },
      { id: 'successful', label: 'Successful', coreEmotionId: 'happy' },
      { id: 'confident', label: 'Confident', coreEmotionId: 'happy' },
      { id: 'respected', label: 'Respected', coreEmotionId: 'happy' },
      { id: 'valued', label: 'Valued', coreEmotionId: 'happy' },
      { id: 'courageous', label: 'Courageous', coreEmotionId: 'happy' },
      { id: 'creative', label: 'Creative', coreEmotionId: 'happy' },
      { id: 'loving', label: 'Loving', coreEmotionId: 'happy' },
      { id: 'thankful', label: 'Thankful', coreEmotionId: 'happy' },
      { id: 'sensitive', label: 'Sensitive', coreEmotionId: 'happy' },
      { id: 'intimate', label: 'Intimate', coreEmotionId: 'happy' },
      { id: 'hopeful', label: 'Hopeful', coreEmotionId: 'happy' },
      { id: 'inspired', label: 'Inspired', coreEmotionId: 'happy' },
    ],
  },
  {
    id: 'surprised',
    label: 'Surprised',
    color: 'hsl(320, 70%, 60%)', // Pink
    detailedEmotions: [
      { id: 'startled', label: 'Startled', coreEmotionId: 'surprised' },
      { id: 'shocked', label: 'Shocked', coreEmotionId: 'surprised' },
      { id: 'dismayed', label: 'Dismayed', coreEmotionId: 'surprised' },
      { id: 'confused', label: 'Confused', coreEmotionId: 'surprised' },
      { id: 'disillusioned', label: 'Disillusioned', coreEmotionId: 'surprised' },
      { id: 'perplexed', label: 'Perplexed', coreEmotionId: 'surprised' },
      { id: 'amazed', label: 'Amazed', coreEmotionId: 'surprised' },
      { id: 'astonished', label: 'Astonished', coreEmotionId: 'surprised' },
      { id: 'awe', label: 'Awe', coreEmotionId: 'surprised' },
      { id: 'excited', label: 'Excited', coreEmotionId: 'surprised' },
      { id: 'eager', label: 'Eager', coreEmotionId: 'surprised' },
      { id: 'energetic', label: 'Energetic', coreEmotionId: 'surprised' },
    ],
  },
  {
    id: 'neutral',
    label: 'Neutral',
    color: 'hsl(230, 12%, 55%)', // Cool gray
    detailedEmotions: [{ id: 'neutral', label: 'Neutral', coreEmotionId: 'neutral' }],
  },
  {
    id: 'bad',
    label: 'Bad',
    color: 'hsl(30, 80%, 50%)', // Orange
    detailedEmotions: [
      { id: 'bored', label: 'Bored', coreEmotionId: 'bad' },
      { id: 'indifferent', label: 'Indifferent', coreEmotionId: 'bad' },
      { id: 'apathetic', label: 'Apathetic', coreEmotionId: 'bad' },
      { id: 'busy', label: 'Busy', coreEmotionId: 'bad' },
      { id: 'pressured', label: 'Pressured', coreEmotionId: 'bad' },
      { id: 'rushed', label: 'Rushed', coreEmotionId: 'bad' },
      { id: 'stressed', label: 'Stressed', coreEmotionId: 'bad' },
      { id: 'out_of_control', label: 'Out of Control', coreEmotionId: 'bad' },
      { id: 'tired', label: 'Tired', coreEmotionId: 'bad' },
      { id: 'sleepy', label: 'Sleepy', coreEmotionId: 'bad' },
      { id: 'unfocused', label: 'Unfocused', coreEmotionId: 'bad' },
    ],
  },
  {
    id: 'sad',
    label: 'Sad',
    color: 'hsl(210, 70%, 55%)', // Blue
    detailedEmotions: [
      { id: 'lonely', label: 'Lonely', coreEmotionId: 'sad' },
      { id: 'isolated', label: 'Isolated', coreEmotionId: 'sad' },
      { id: 'abandoned', label: 'Abandoned', coreEmotionId: 'sad' },
      { id: 'vulnerable', label: 'Vulnerable', coreEmotionId: 'sad' },
      { id: 'victimized', label: 'Victimized', coreEmotionId: 'sad' },
      { id: 'fragile', label: 'Fragile', coreEmotionId: 'sad' },
      { id: 'grief', label: 'Grief', coreEmotionId: 'sad' },
      { id: 'powerless', label: 'Powerless', coreEmotionId: 'sad' },
      { id: 'guilty', label: 'Guilty', coreEmotionId: 'sad' },
      { id: 'ashamed', label: 'Ashamed', coreEmotionId: 'sad' },
      { id: 'remorseful', label: 'Remorseful', coreEmotionId: 'sad' },
      { id: 'depressed', label: 'Depressed', coreEmotionId: 'sad' },
      { id: 'inferior', label: 'Inferior', coreEmotionId: 'sad' },
      { id: 'empty', label: 'Empty', coreEmotionId: 'sad' },
      { id: 'hurt', label: 'Hurt', coreEmotionId: 'sad' },
      { id: 'embarrassed', label: 'Embarrassed', coreEmotionId: 'sad' },
      { id: 'disappointed', label: 'Disappointed', coreEmotionId: 'sad' },
    ],
  },
  {
    id: 'fearful',
    label: 'Fearful',
    color: 'hsl(280, 60%, 55%)', // Purple
    detailedEmotions: [
      { id: 'scared', label: 'Scared', coreEmotionId: 'fearful' },
      { id: 'helpless', label: 'Helpless', coreEmotionId: 'fearful' },
      { id: 'frightened', label: 'Frightened', coreEmotionId: 'fearful' },
      { id: 'anxious', label: 'Anxious', coreEmotionId: 'fearful' },
      { id: 'overwhelmed', label: 'Overwhelmed', coreEmotionId: 'fearful' },
      { id: 'worried', label: 'Worried', coreEmotionId: 'fearful' },
      { id: 'insecure', label: 'Insecure', coreEmotionId: 'fearful' },
      { id: 'inadequate', label: 'Inadequate', coreEmotionId: 'fearful' },
      { id: 'inferior_fear', label: 'Inferior', coreEmotionId: 'fearful' },
      { id: 'weak', label: 'Weak', coreEmotionId: 'fearful' },
      { id: 'worthless', label: 'Worthless', coreEmotionId: 'fearful' },
      { id: 'insignificant', label: 'Insignificant', coreEmotionId: 'fearful' },
      { id: 'rejected', label: 'Rejected', coreEmotionId: 'fearful' },
      { id: 'excluded', label: 'Excluded', coreEmotionId: 'fearful' },
      { id: 'persecuted', label: 'Persecuted', coreEmotionId: 'fearful' },
      { id: 'threatened', label: 'Threatened', coreEmotionId: 'fearful' },
      { id: 'nervous', label: 'Nervous', coreEmotionId: 'fearful' },
      { id: 'exposed', label: 'Exposed', coreEmotionId: 'fearful' },
    ],
  },
  {
    id: 'disgusted',
    label: 'Disgusted',
    color: 'hsl(145, 55%, 45%)', // Green
    detailedEmotions: [
      { id: 'disapproving', label: 'Disapproving', coreEmotionId: 'disgusted' },
      { id: 'judgmental', label: 'Judgmental', coreEmotionId: 'disgusted' },
      { id: 'loathing', label: 'Loathing', coreEmotionId: 'disgusted' },
      { id: 'revolted', label: 'Revolted', coreEmotionId: 'disgusted' },
      { id: 'appalled', label: 'Appalled', coreEmotionId: 'disgusted' },
      { id: 'awful', label: 'Awful', coreEmotionId: 'disgusted' },
      { id: 'nauseated', label: 'Nauseated', coreEmotionId: 'disgusted' },
      { id: 'detestable', label: 'Detestable', coreEmotionId: 'disgusted' },
      { id: 'repelled', label: 'Repelled', coreEmotionId: 'disgusted' },
      { id: 'horrified', label: 'Horrified', coreEmotionId: 'disgusted' },
      { id: 'hesitant', label: 'Hesitant', coreEmotionId: 'disgusted' },
    ],
  },
  {
    id: 'angry',
    label: 'Angry',
    color: 'hsl(0, 75%, 55%)', // Red
    detailedEmotions: [
      { id: 'let_down', label: 'Let Down', coreEmotionId: 'angry' },
      { id: 'betrayed', label: 'Betrayed', coreEmotionId: 'angry' },
      { id: 'resentful', label: 'Resentful', coreEmotionId: 'angry' },
      { id: 'humiliated', label: 'Humiliated', coreEmotionId: 'angry' },
      { id: 'disrespected', label: 'Disrespected', coreEmotionId: 'angry' },
      { id: 'ridiculed', label: 'Ridiculed', coreEmotionId: 'angry' },
      { id: 'bitter', label: 'Bitter', coreEmotionId: 'angry' },
      { id: 'indignant', label: 'Indignant', coreEmotionId: 'angry' },
      { id: 'violated', label: 'Violated', coreEmotionId: 'angry' },
      { id: 'mad', label: 'Mad', coreEmotionId: 'angry' },
      { id: 'furious', label: 'Furious', coreEmotionId: 'angry' },
      { id: 'jealous', label: 'Jealous', coreEmotionId: 'angry' },
      { id: 'aggressive', label: 'Aggressive', coreEmotionId: 'angry' },
      { id: 'provoked', label: 'Provoked', coreEmotionId: 'angry' },
      { id: 'hostile', label: 'Hostile', coreEmotionId: 'angry' },
      { id: 'frustrated', label: 'Frustrated', coreEmotionId: 'angry' },
      { id: 'infuriated', label: 'Infuriated', coreEmotionId: 'angry' },
      { id: 'annoyed', label: 'Annoyed', coreEmotionId: 'angry' },
      { id: 'distant', label: 'Distant', coreEmotionId: 'angry' },
      { id: 'withdrawn', label: 'Withdrawn', coreEmotionId: 'angry' },
      { id: 'numb', label: 'Numb', coreEmotionId: 'angry' },
      { id: 'critical', label: 'Critical', coreEmotionId: 'angry' },
      { id: 'skeptical', label: 'Skeptical', coreEmotionId: 'angry' },
      { id: 'dismissive', label: 'Dismissive', coreEmotionId: 'angry' },
    ],
  },
]

// ----- Helper Functions -----

export function getCoreEmotionById(id: CoreEmotionId): CoreEmotion | undefined {
  return FEELINGS_WHEEL.find((e) => e.id === id)
}

export function getDetailedEmotionById(id: string): DetailedEmotion | undefined {
  for (const core of FEELINGS_WHEEL) {
    const found = core.detailedEmotions.find((e) => e.id === id)
    if (found) return found
  }
  return undefined
}

export function getAllDetailedEmotions(): DetailedEmotion[] {
  return FEELINGS_WHEEL.flatMap((core) => core.detailedEmotions)
}

export function getDetailedEmotionsByCoreId(coreId: CoreEmotionId): DetailedEmotion[] {
  const core = getCoreEmotionById(coreId)
  return core?.detailedEmotions ?? []
}

export function getEmotionLabel(emotionId: string): string {
  const detailed = getDetailedEmotionById(emotionId)
  if (detailed) return detailed.label

  const core = FEELINGS_WHEEL.find((c) => c.id === emotionId)
  if (core) return core.label

  return emotionId
}

export function getCoreEmotionForDetailed(detailedId: string): CoreEmotion | undefined {
  const detailed = getDetailedEmotionById(detailedId)
  if (!detailed) return undefined
  return getCoreEmotionById(detailed.coreEmotionId)
}

export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  return 'evening'
}

export function getCheckInLabel(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case 'morning':
      return 'Morning Check-In'
    case 'afternoon':
      return 'Afternoon Check-In'
    case 'evening':
      return 'Evening Check-In'
  }
}

// ----- Daily Check-In Model -----

export interface DailyCheckIn {
  checkInId: CheckInId
  userId: string
  dateKey: string // YYYY-MM-DD
  timeOfDay: TimeOfDay
  energyLevel: EnergyLevel
  emotionId: string // Detailed emotion ID from outer ring
  coreEmotionId: CoreEmotionId // Core emotion for reference
  createdAtMs: number
  notes?: string
}

export type CreateCheckInInput = Omit<DailyCheckIn, 'checkInId' | 'createdAtMs'>
