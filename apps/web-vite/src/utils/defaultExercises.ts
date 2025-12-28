/**
 * Default Exercise Library
 *
 * Common exercises to seed the user's library on first use.
 * Covers all major categories with practical equipment and metrics.
 */

import type { ExerciseCategory } from '@lifeos/training'

export interface DefaultExercise {
  name: string
  category: ExerciseCategory
  equipment?: string[]
  defaultMetrics: Array<'sets_reps_weight' | 'time' | 'distance' | 'reps_only' | 'rpe'>
}

export function getDefaultExercises(): DefaultExercise[] {
  return [
    // Push exercises
    {
      name: 'Bench Press',
      category: 'push',
      equipment: ['Barbell', 'Bench'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Incline Bench Press',
      category: 'push',
      equipment: ['Barbell', 'Bench'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Overhead Press',
      category: 'push',
      equipment: ['Barbell'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Dumbbell Shoulder Press',
      category: 'push',
      equipment: ['Dumbbells'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Push-ups',
      category: 'push',
      equipment: [],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Dips',
      category: 'push',
      equipment: ['Dip Station'],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Tricep Pushdown',
      category: 'push',
      equipment: ['Cable Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },

    // Pull exercises
    {
      name: 'Deadlift',
      category: 'pull',
      equipment: ['Barbell'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Pull-ups',
      category: 'pull',
      equipment: ['Pull-up Bar'],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Barbell Row',
      category: 'pull',
      equipment: ['Barbell'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Dumbbell Row',
      category: 'pull',
      equipment: ['Dumbbells', 'Bench'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Lat Pulldown',
      category: 'pull',
      equipment: ['Cable Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Face Pulls',
      category: 'pull',
      equipment: ['Cable Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Barbell Curl',
      category: 'pull',
      equipment: ['Barbell'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },

    // Legs exercises
    {
      name: 'Back Squat',
      category: 'legs',
      equipment: ['Barbell', 'Squat Rack'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Front Squat',
      category: 'legs',
      equipment: ['Barbell', 'Squat Rack'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Romanian Deadlift',
      category: 'legs',
      equipment: ['Barbell'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Leg Press',
      category: 'legs',
      equipment: ['Leg Press Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Lunges',
      category: 'legs',
      equipment: ['Dumbbells'],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Bulgarian Split Squat',
      category: 'legs',
      equipment: ['Dumbbells', 'Bench'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Leg Curl',
      category: 'legs',
      equipment: ['Leg Curl Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Leg Extension',
      category: 'legs',
      equipment: ['Leg Extension Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },
    {
      name: 'Calf Raises',
      category: 'legs',
      equipment: ['Calf Raise Machine'],
      defaultMetrics: ['sets_reps_weight', 'rpe'],
    },

    // Core exercises
    {
      name: 'Plank',
      category: 'core',
      equipment: [],
      defaultMetrics: ['time', 'rpe'],
    },
    {
      name: 'Side Plank',
      category: 'core',
      equipment: [],
      defaultMetrics: ['time', 'rpe'],
    },
    {
      name: 'Crunches',
      category: 'core',
      equipment: [],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Russian Twists',
      category: 'core',
      equipment: [],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Hanging Leg Raises',
      category: 'core',
      equipment: ['Pull-up Bar'],
      defaultMetrics: ['reps_only', 'rpe'],
    },
    {
      name: 'Ab Wheel Rollout',
      category: 'core',
      equipment: ['Ab Wheel'],
      defaultMetrics: ['reps_only', 'rpe'],
    },

    // Conditioning exercises
    {
      name: 'Running',
      category: 'conditioning',
      equipment: [],
      defaultMetrics: ['distance', 'time', 'rpe'],
    },
    {
      name: 'Cycling',
      category: 'conditioning',
      equipment: ['Bike'],
      defaultMetrics: ['distance', 'time', 'rpe'],
    },
    {
      name: 'Rowing',
      category: 'conditioning',
      equipment: ['Rowing Machine'],
      defaultMetrics: ['distance', 'time', 'rpe'],
    },
    {
      name: 'Jump Rope',
      category: 'conditioning',
      equipment: ['Jump Rope'],
      defaultMetrics: ['time', 'rpe'],
    },
    {
      name: 'Burpees',
      category: 'conditioning',
      equipment: [],
      defaultMetrics: ['reps_only', 'time', 'rpe'],
    },
    {
      name: 'Box Jumps',
      category: 'conditioning',
      equipment: ['Plyo Box'],
      defaultMetrics: ['reps_only', 'rpe'],
    },

    // Mobility exercises
    {
      name: 'Hamstring Stretch',
      category: 'mobility',
      equipment: [],
      defaultMetrics: ['time'],
    },
    {
      name: 'Hip Flexor Stretch',
      category: 'mobility',
      equipment: [],
      defaultMetrics: ['time'],
    },
    {
      name: 'Shoulder Dislocations',
      category: 'mobility',
      equipment: ['Resistance Band'],
      defaultMetrics: ['reps_only'],
    },
    {
      name: 'Cat-Cow Stretch',
      category: 'mobility',
      equipment: [],
      defaultMetrics: ['reps_only', 'time'],
    },
    {
      name: 'Pigeon Pose',
      category: 'mobility',
      equipment: [],
      defaultMetrics: ['time'],
    },
    {
      name: 'Foam Rolling',
      category: 'mobility',
      equipment: ['Foam Roller'],
      defaultMetrics: ['time'],
    },
  ]
}
