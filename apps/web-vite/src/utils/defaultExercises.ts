/**
 * Default Exercise Library
 *
 * Common exercises to seed the user's library on first use.
 * New schema with generic names and context-specific variants.
 */

import type { ExerciseTypeCategory, ExerciseVariant } from '@lifeos/training'

export interface DefaultExercise {
  generic_name: string
  target_muscle_group: string | string[]
  category: ExerciseTypeCategory
  gym: ExerciseVariant[]
  home: ExerciseVariant[]
  road: ExerciseVariant[]
}

// Category display names for UI
export const EXERCISE_CATEGORY_LABELS: Record<ExerciseTypeCategory, string> = {
  lower_body: 'Lower Body',
  upper_body: 'Upper Body',
  arms: 'Arms',
  core: 'Core',
  mobility_stability: 'Mobility & Stability',
  cardio: 'Cardio',
  yoga: 'Yoga',
}

// All exercise type categories
export const EXERCISE_TYPE_CATEGORIES: ExerciseTypeCategory[] = [
  'lower_body',
  'upper_body',
  'arms',
  'core',
  'mobility_stability',
  'cardio',
  'yoga',
]

export function getDefaultExercises(): DefaultExercise[] {
  return [
    // Lower Body exercises
    {
      generic_name: 'Squat',
      target_muscle_group: ['Quadriceps', 'Glutes'],
      category: 'lower_body',
      gym: [
        { name: 'Barbell Back Squat', equipment: ['Barbell', 'Squat Rack'] },
        { name: 'Barbell Front Squat', equipment: ['Barbell', 'Squat Rack'] },
        { name: 'Goblet Squat', equipment: ['Dumbbell', 'Kettlebell'] },
        { name: 'Leg Press', equipment: ['Leg Press Machine'] },
      ],
      home: [
        { name: 'Bodyweight Squat' },
        { name: 'Goblet Squat', equipment: ['Dumbbell'] },
        { name: 'Pistol Squat' },
      ],
      road: [{ name: 'Bodyweight Squat' }, { name: 'Jump Squat' }],
    },
    {
      generic_name: 'Lunge',
      target_muscle_group: ['Quadriceps', 'Glutes', 'Hamstrings'],
      category: 'lower_body',
      gym: [
        { name: 'Barbell Lunge', equipment: ['Barbell'] },
        { name: 'Dumbbell Lunge', equipment: ['Dumbbells'] },
        { name: 'Walking Lunge', equipment: ['Dumbbells'] },
        { name: 'Bulgarian Split Squat', equipment: ['Dumbbells', 'Bench'] },
      ],
      home: [{ name: 'Bodyweight Lunge' }, { name: 'Walking Lunge' }, { name: 'Reverse Lunge' }],
      road: [{ name: 'Walking Lunge' }, { name: 'Jump Lunge' }],
    },
    {
      generic_name: 'Deadlift',
      target_muscle_group: ['Hamstrings', 'Glutes', 'Lower Back'],
      category: 'lower_body',
      gym: [
        { name: 'Conventional Deadlift', equipment: ['Barbell'] },
        { name: 'Sumo Deadlift', equipment: ['Barbell'] },
        { name: 'Romanian Deadlift', equipment: ['Barbell'] },
        { name: 'Trap Bar Deadlift', equipment: ['Trap Bar'] },
      ],
      home: [
        { name: 'Single Leg Romanian Deadlift', equipment: ['Dumbbell'] },
        { name: 'Dumbbell Romanian Deadlift', equipment: ['Dumbbells'] },
      ],
      road: [{ name: 'Single Leg Deadlift' }],
    },
    {
      generic_name: 'Leg Curl',
      target_muscle_group: 'Hamstrings',
      category: 'lower_body',
      gym: [
        { name: 'Lying Leg Curl', equipment: ['Leg Curl Machine'] },
        { name: 'Seated Leg Curl', equipment: ['Leg Curl Machine'] },
      ],
      home: [
        { name: 'Nordic Curl' },
        { name: 'Stability Ball Leg Curl', equipment: ['Stability Ball'] },
      ],
      road: [],
    },
    {
      generic_name: 'Leg Extension',
      target_muscle_group: 'Quadriceps',
      category: 'lower_body',
      gym: [{ name: 'Leg Extension Machine', equipment: ['Leg Extension Machine'] }],
      home: [{ name: 'Sissy Squat' }],
      road: [],
    },
    {
      generic_name: 'Calf Raise',
      target_muscle_group: 'Calves',
      category: 'lower_body',
      gym: [
        { name: 'Standing Calf Raise', equipment: ['Calf Raise Machine'] },
        { name: 'Seated Calf Raise', equipment: ['Seated Calf Machine'] },
        { name: 'Donkey Calf Raise', equipment: ['Calf Raise Machine'] },
      ],
      home: [{ name: 'Single Leg Calf Raise' }, { name: 'Bodyweight Calf Raise' }],
      road: [{ name: 'Single Leg Calf Raise' }],
    },
    {
      generic_name: 'Hip Thrust',
      target_muscle_group: 'Glutes',
      category: 'lower_body',
      gym: [
        { name: 'Barbell Hip Thrust', equipment: ['Barbell', 'Bench'] },
        { name: 'Machine Hip Thrust', equipment: ['Hip Thrust Machine'] },
      ],
      home: [{ name: 'Glute Bridge' }, { name: 'Single Leg Glute Bridge' }],
      road: [{ name: 'Glute Bridge' }],
    },
    {
      generic_name: 'Step-up',
      target_muscle_group: ['Quadriceps', 'Glutes'],
      category: 'lower_body',
      gym: [
        { name: 'Barbell Step-up', equipment: ['Barbell', 'Plyo Box'] },
        { name: 'Dumbbell Step-up', equipment: ['Dumbbells', 'Plyo Box'] },
      ],
      home: [
        { name: 'Kettlebell Step-up', equipment: ['Kettlebell'] },
        { name: 'Bodyweight Step-up' },
      ],
      road: [{ name: 'Park Bench Step-up' }],
    },
    {
      generic_name: 'Glute-Ham Raise',
      target_muscle_group: ['Hamstrings', 'Glutes'],
      category: 'lower_body',
      gym: [{ name: 'GHD Raise', equipment: ['GHD Machine'] }],
      home: [{ name: 'Nordic Hamstring Curl' }, { name: 'Slider Leg Curl' }],
      road: [{ name: 'Nordic Hamstring Curl' }],
    },
    {
      generic_name: 'Goblet Squat',
      target_muscle_group: ['Quadriceps', 'Glutes', 'Core'],
      category: 'lower_body',
      gym: [
        { name: 'Dumbbell Goblet Squat', equipment: ['Dumbbell'] },
        { name: 'Kettlebell Goblet Squat', equipment: ['Kettlebell'] },
      ],
      home: [
        { name: 'Kettlebell Goblet Squat', equipment: ['Kettlebell'] },
        { name: 'Dumbbell Goblet Squat', equipment: ['Dumbbell'] },
      ],
      road: [{ name: 'Bodyweight Squat Hold' }],
    },

    // Upper Body exercises
    {
      generic_name: 'Bench Press',
      target_muscle_group: ['Chest', 'Triceps', 'Shoulders'],
      category: 'upper_body',
      gym: [
        { name: 'Barbell Bench Press', equipment: ['Barbell', 'Bench'] },
        { name: 'Incline Barbell Press', equipment: ['Barbell', 'Incline Bench'] },
        { name: 'Dumbbell Bench Press', equipment: ['Dumbbells', 'Bench'] },
        { name: 'Decline Bench Press', equipment: ['Barbell', 'Decline Bench'] },
      ],
      home: [{ name: 'Dumbbell Floor Press', equipment: ['Dumbbells'] }, { name: 'Push-up' }],
      road: [{ name: 'Push-up' }],
    },
    {
      generic_name: 'Push-up',
      target_muscle_group: ['Chest', 'Triceps', 'Shoulders'],
      category: 'upper_body',
      gym: [{ name: 'Push-up' }, { name: 'Weighted Push-up', equipment: ['Weight Plate'] }],
      home: [
        { name: 'Push-up' },
        { name: 'Diamond Push-up' },
        { name: 'Pike Push-up' },
        { name: 'Decline Push-up' },
      ],
      road: [{ name: 'Push-up' }, { name: 'Diamond Push-up' }, { name: 'Pike Push-up' }],
    },
    {
      generic_name: 'Overhead Press',
      target_muscle_group: ['Shoulders', 'Triceps'],
      category: 'upper_body',
      gym: [
        { name: 'Barbell Overhead Press', equipment: ['Barbell'] },
        { name: 'Dumbbell Shoulder Press', equipment: ['Dumbbells'] },
        { name: 'Machine Shoulder Press', equipment: ['Shoulder Press Machine'] },
        { name: 'Push Press', equipment: ['Barbell'] },
      ],
      home: [
        { name: 'Dumbbell Shoulder Press', equipment: ['Dumbbells'] },
        { name: 'Pike Push-up' },
      ],
      road: [{ name: 'Pike Push-up' }, { name: 'Handstand Push-up' }],
    },
    {
      generic_name: 'Row',
      target_muscle_group: ['Back', 'Biceps'],
      category: 'upper_body',
      gym: [
        { name: 'Barbell Row', equipment: ['Barbell'] },
        { name: 'Dumbbell Row', equipment: ['Dumbbell', 'Bench'] },
        { name: 'Cable Row', equipment: ['Cable Machine'] },
        { name: 'T-Bar Row', equipment: ['T-Bar'] },
      ],
      home: [
        { name: 'Dumbbell Row', equipment: ['Dumbbell'] },
        { name: 'Inverted Row' },
        { name: 'Resistance Band Row', equipment: ['Resistance Band'] },
      ],
      road: [{ name: 'Inverted Row' }],
    },
    {
      generic_name: 'Pull-up',
      target_muscle_group: ['Back', 'Biceps'],
      category: 'upper_body',
      gym: [
        { name: 'Pull-up', equipment: ['Pull-up Bar'] },
        { name: 'Weighted Pull-up', equipment: ['Pull-up Bar', 'Weight Belt'] },
        { name: 'Lat Pulldown', equipment: ['Lat Pulldown Machine'] },
      ],
      home: [
        { name: 'Pull-up', equipment: ['Pull-up Bar'] },
        { name: 'Chin-up', equipment: ['Pull-up Bar'] },
      ],
      road: [{ name: 'Tree Branch Pull-up' }],
    },
    {
      generic_name: 'Dip',
      target_muscle_group: ['Chest', 'Triceps', 'Shoulders'],
      category: 'upper_body',
      gym: [
        { name: 'Parallel Bar Dip', equipment: ['Dip Station'] },
        { name: 'Weighted Dip', equipment: ['Dip Station', 'Weight Belt'] },
        { name: 'Machine Dip', equipment: ['Dip Machine'] },
      ],
      home: [{ name: 'Bench Dip', equipment: ['Bench'] }, { name: 'Chair Dip' }],
      road: [{ name: 'Bench Dip' }],
    },
    {
      generic_name: 'Lateral Raise',
      target_muscle_group: 'Shoulders',
      category: 'upper_body',
      gym: [
        { name: 'Dumbbell Lateral Raise', equipment: ['Dumbbells'] },
        { name: 'Cable Lateral Raise', equipment: ['Cable Machine'] },
        { name: 'Machine Lateral Raise', equipment: ['Lateral Raise Machine'] },
      ],
      home: [
        { name: 'Dumbbell Lateral Raise', equipment: ['Dumbbells'] },
        { name: 'Resistance Band Lateral Raise', equipment: ['Resistance Band'] },
      ],
      road: [],
    },
    {
      generic_name: 'Face Pull',
      target_muscle_group: ['Rear Delts', 'Upper Back'],
      category: 'upper_body',
      gym: [
        { name: 'Cable Face Pull', equipment: ['Cable Machine'] },
        { name: 'Machine Rear Delt Fly', equipment: ['Pec Deck'] },
      ],
      home: [
        { name: 'Dumbbell Rear Delt Fly', equipment: ['Dumbbells'] },
        { name: 'Kettlebell High Pull', equipment: ['Kettlebell'] },
      ],
      road: [{ name: 'Prone Y Raise' }],
    },
    {
      generic_name: 'Chest Fly',
      target_muscle_group: 'Chest',
      category: 'upper_body',
      gym: [
        { name: 'Dumbbell Fly', equipment: ['Dumbbells', 'Bench'] },
        { name: 'Cable Crossover', equipment: ['Cable Machine'] },
        { name: 'Pec Deck Fly', equipment: ['Pec Deck'] },
      ],
      home: [{ name: 'Dumbbell Floor Fly', equipment: ['Dumbbells'] }],
      road: [{ name: 'Wide Push-up' }],
    },
    {
      generic_name: 'Shrug',
      target_muscle_group: 'Traps',
      category: 'upper_body',
      gym: [
        { name: 'Barbell Shrug', equipment: ['Barbell'] },
        { name: 'Dumbbell Shrug', equipment: ['Dumbbells'] },
        { name: 'Trap Bar Shrug', equipment: ['Trap Bar'] },
      ],
      home: [
        { name: 'Dumbbell Shrug', equipment: ['Dumbbells'] },
        { name: 'Kettlebell Shrug', equipment: ['Kettlebell'] },
      ],
      road: [],
    },

    // Arms exercises
    {
      generic_name: 'Bicep Curl',
      target_muscle_group: 'Biceps',
      category: 'arms',
      gym: [
        { name: 'Barbell Curl', equipment: ['Barbell'] },
        { name: 'Dumbbell Curl', equipment: ['Dumbbells'] },
        { name: 'Preacher Curl', equipment: ['EZ Bar', 'Preacher Bench'] },
        { name: 'Cable Curl', equipment: ['Cable Machine'] },
        { name: 'Hammer Curl', equipment: ['Dumbbells'] },
      ],
      home: [
        { name: 'Dumbbell Curl', equipment: ['Dumbbells'] },
        { name: 'Resistance Band Curl', equipment: ['Resistance Band'] },
        { name: 'Hammer Curl', equipment: ['Dumbbells'] },
      ],
      road: [{ name: 'Resistance Band Curl', equipment: ['Resistance Band'] }],
    },
    {
      generic_name: 'Tricep Extension',
      target_muscle_group: 'Triceps',
      category: 'arms',
      gym: [
        { name: 'Tricep Pushdown', equipment: ['Cable Machine'] },
        { name: 'Skull Crusher', equipment: ['EZ Bar', 'Bench'] },
        { name: 'Overhead Tricep Extension', equipment: ['Dumbbell'] },
        { name: 'Close Grip Bench Press', equipment: ['Barbell', 'Bench'] },
      ],
      home: [
        { name: 'Overhead Tricep Extension', equipment: ['Dumbbell'] },
        { name: 'Diamond Push-up' },
        { name: 'Bench Dip' },
      ],
      road: [{ name: 'Diamond Push-up' }, { name: 'Bench Dip' }],
    },
    {
      generic_name: 'Wrist Curl',
      target_muscle_group: 'Forearms',
      category: 'arms',
      gym: [
        { name: 'Wrist Curl', equipment: ['Barbell', 'Bench'] },
        { name: 'Reverse Wrist Curl', equipment: ['Barbell', 'Bench'] },
      ],
      home: [{ name: 'Dumbbell Wrist Curl', equipment: ['Dumbbell'] }],
      road: [],
    },
    {
      generic_name: 'Concentration Curl',
      target_muscle_group: 'Biceps',
      category: 'arms',
      gym: [
        { name: 'Dumbbell Concentration Curl', equipment: ['Dumbbell', 'Bench'] },
        { name: 'Cable Concentration Curl', equipment: ['Cable Machine'] },
      ],
      home: [{ name: 'Dumbbell Concentration Curl', equipment: ['Dumbbell'] }],
      road: [],
    },
    {
      generic_name: 'Hammer Curl',
      target_muscle_group: ['Biceps', 'Brachioradialis'],
      category: 'arms',
      gym: [
        { name: 'Dumbbell Hammer Curl', equipment: ['Dumbbells'] },
        { name: 'Rope Cable Hammer Curl', equipment: ['Cable Machine'] },
      ],
      home: [
        { name: 'Dumbbell Hammer Curl', equipment: ['Dumbbells'] },
        { name: 'Kettlebell Hammer Curl', equipment: ['Kettlebell'] },
      ],
      road: [],
    },
    {
      generic_name: 'Skull Crusher',
      target_muscle_group: 'Triceps',
      category: 'arms',
      gym: [
        { name: 'EZ Bar Skull Crusher', equipment: ['EZ Bar', 'Bench'] },
        { name: 'Dumbbell Skull Crusher', equipment: ['Dumbbells', 'Bench'] },
      ],
      home: [{ name: 'Dumbbell Skull Crusher', equipment: ['Dumbbells'] }],
      road: [],
    },
    {
      generic_name: 'Tricep Kickback',
      target_muscle_group: 'Triceps',
      category: 'arms',
      gym: [
        { name: 'Dumbbell Kickback', equipment: ['Dumbbell', 'Bench'] },
        { name: 'Cable Kickback', equipment: ['Cable Machine'] },
      ],
      home: [
        { name: 'Dumbbell Kickback', equipment: ['Dumbbell'] },
        { name: 'Kettlebell Kickback', equipment: ['Kettlebell'] },
      ],
      road: [],
    },
    {
      generic_name: 'Reverse Curl',
      target_muscle_group: ['Forearms', 'Brachioradialis'],
      category: 'arms',
      gym: [
        { name: 'EZ Bar Reverse Curl', equipment: ['EZ Bar'] },
        { name: 'Dumbbell Reverse Curl', equipment: ['Dumbbells'] },
      ],
      home: [{ name: 'Dumbbell Reverse Curl', equipment: ['Dumbbells'] }],
      road: [],
    },
    {
      generic_name: 'Chin-up',
      target_muscle_group: ['Biceps', 'Back'],
      category: 'arms',
      gym: [
        { name: 'Chin-up', equipment: ['Pull-up Bar'] },
        { name: 'Weighted Chin-up', equipment: ['Pull-up Bar', 'Weight Belt'] },
      ],
      home: [{ name: 'Chin-up', equipment: ['Pull-up Bar'] }],
      road: [{ name: 'Underhand Inverted Row' }],
    },
    {
      generic_name: 'Farmer Carry',
      target_muscle_group: ['Forearms', 'Traps', 'Core'],
      category: 'arms',
      gym: [
        { name: 'Dumbbell Farmer Walk', equipment: ['Dumbbells'] },
        { name: 'Trap Bar Carry', equipment: ['Trap Bar'] },
      ],
      home: [
        { name: 'Kettlebell Farmer Walk', equipment: ['Kettlebells'] },
        { name: 'Dumbbell Farmer Walk', equipment: ['Dumbbells'] },
      ],
      road: [],
    },

    // Core exercises
    {
      generic_name: 'Plank',
      target_muscle_group: 'Core',
      category: 'core',
      gym: [
        { name: 'Plank' },
        { name: 'Weighted Plank', equipment: ['Weight Plate'] },
        { name: 'Side Plank' },
      ],
      home: [{ name: 'Plank' }, { name: 'Side Plank' }, { name: 'Plank with Shoulder Tap' }],
      road: [{ name: 'Plank' }, { name: 'Side Plank' }],
    },
    {
      generic_name: 'Crunch',
      target_muscle_group: 'Abs',
      category: 'core',
      gym: [
        { name: 'Cable Crunch', equipment: ['Cable Machine'] },
        { name: 'Machine Crunch', equipment: ['Ab Crunch Machine'] },
        { name: 'Weighted Crunch', equipment: ['Weight Plate'] },
      ],
      home: [{ name: 'Crunch' }, { name: 'Bicycle Crunch' }, { name: 'Reverse Crunch' }],
      road: [{ name: 'Crunch' }, { name: 'Bicycle Crunch' }],
    },
    {
      generic_name: 'Leg Raise',
      target_muscle_group: 'Lower Abs',
      category: 'core',
      gym: [
        { name: 'Hanging Leg Raise', equipment: ['Pull-up Bar'] },
        { name: "Captain's Chair Leg Raise", equipment: ["Captain's Chair"] },
      ],
      home: [
        { name: 'Lying Leg Raise' },
        { name: 'Hanging Leg Raise', equipment: ['Pull-up Bar'] },
      ],
      road: [{ name: 'Lying Leg Raise' }],
    },
    {
      generic_name: 'Russian Twist',
      target_muscle_group: 'Obliques',
      category: 'core',
      gym: [
        { name: 'Russian Twist', equipment: ['Medicine Ball'] },
        { name: 'Cable Woodchop', equipment: ['Cable Machine'] },
      ],
      home: [
        { name: 'Russian Twist' },
        { name: 'Russian Twist with Weight', equipment: ['Dumbbell'] },
      ],
      road: [{ name: 'Russian Twist' }],
    },
    {
      generic_name: 'Ab Wheel Rollout',
      target_muscle_group: 'Core',
      category: 'core',
      gym: [{ name: 'Ab Wheel Rollout', equipment: ['Ab Wheel'] }],
      home: [{ name: 'Ab Wheel Rollout', equipment: ['Ab Wheel'] }],
      road: [],
    },
    {
      generic_name: 'Dead Bug',
      target_muscle_group: ['Core', 'Hip Flexors'],
      category: 'core',
      gym: [{ name: 'Dead Bug' }, { name: 'Weighted Dead Bug', equipment: ['Dumbbell'] }],
      home: [{ name: 'Dead Bug' }, { name: 'Dead Bug with Kettlebell', equipment: ['Kettlebell'] }],
      road: [{ name: 'Dead Bug' }],
    },
    {
      generic_name: 'Pallof Press',
      target_muscle_group: ['Core', 'Obliques'],
      category: 'core',
      gym: [{ name: 'Cable Pallof Press', equipment: ['Cable Machine'] }],
      home: [
        { name: 'Resistance Band Pallof Press', equipment: ['Resistance Band'] },
        { name: 'Kettlebell Halo', equipment: ['Kettlebell'] },
      ],
      road: [],
    },
    {
      generic_name: 'Mountain Climber',
      target_muscle_group: ['Core', 'Hip Flexors'],
      category: 'core',
      gym: [
        { name: 'Mountain Climber' },
        { name: 'Sliding Mountain Climber', equipment: ['Sliders'] },
      ],
      home: [{ name: 'Mountain Climber' }, { name: 'Cross-body Mountain Climber' }],
      road: [{ name: 'Mountain Climber' }],
    },
    {
      generic_name: 'Hollow Body Hold',
      target_muscle_group: 'Core',
      category: 'core',
      gym: [{ name: 'Hollow Body Hold' }, { name: 'Hollow Body Rock' }],
      home: [{ name: 'Hollow Body Hold' }, { name: 'Hollow Body Rock' }],
      road: [{ name: 'Hollow Body Hold' }],
    },
    {
      generic_name: 'Turkish Get-up',
      target_muscle_group: ['Core', 'Shoulders', 'Hips'],
      category: 'core',
      gym: [{ name: 'Kettlebell Turkish Get-up', equipment: ['Kettlebell'] }],
      home: [{ name: 'Kettlebell Turkish Get-up', equipment: ['Kettlebell'] }],
      road: [{ name: 'Bodyweight Get-up' }],
    },

    // Mobility & Stability exercises
    {
      generic_name: 'Hip Flexor Stretch',
      target_muscle_group: 'Hip Flexors',
      category: 'mobility_stability',
      gym: [{ name: 'Kneeling Hip Flexor Stretch' }, { name: 'Couch Stretch' }],
      home: [{ name: 'Kneeling Hip Flexor Stretch' }, { name: 'Couch Stretch' }],
      road: [{ name: 'Standing Hip Flexor Stretch' }],
    },
    {
      generic_name: 'Hamstring Stretch',
      target_muscle_group: 'Hamstrings',
      category: 'mobility_stability',
      gym: [{ name: 'Standing Hamstring Stretch' }, { name: 'Seated Hamstring Stretch' }],
      home: [{ name: 'Standing Hamstring Stretch' }, { name: 'Lying Hamstring Stretch' }],
      road: [{ name: 'Standing Hamstring Stretch' }],
    },
    {
      generic_name: 'Shoulder Mobility',
      target_muscle_group: 'Shoulders',
      category: 'mobility_stability',
      gym: [
        { name: 'Shoulder Dislocations', equipment: ['Resistance Band'] },
        { name: 'Wall Slides' },
      ],
      home: [
        { name: 'Shoulder Dislocations', equipment: ['Resistance Band'] },
        { name: 'Wall Slides' },
      ],
      road: [{ name: 'Arm Circles' }],
    },
    {
      generic_name: 'Foam Rolling',
      target_muscle_group: 'Full Body',
      category: 'mobility_stability',
      gym: [
        { name: 'Foam Roll Quads', equipment: ['Foam Roller'] },
        { name: 'Foam Roll IT Band', equipment: ['Foam Roller'] },
        { name: 'Foam Roll Back', equipment: ['Foam Roller'] },
      ],
      home: [
        { name: 'Foam Roll Quads', equipment: ['Foam Roller'] },
        { name: 'Foam Roll IT Band', equipment: ['Foam Roller'] },
        { name: 'Foam Roll Back', equipment: ['Foam Roller'] },
      ],
      road: [],
    },
    {
      generic_name: 'Cat-Cow',
      target_muscle_group: 'Spine',
      category: 'mobility_stability',
      gym: [{ name: 'Cat-Cow Stretch' }],
      home: [{ name: 'Cat-Cow Stretch' }],
      road: [{ name: 'Standing Cat-Cow' }],
    },
    {
      generic_name: 'Pigeon Pose',
      target_muscle_group: 'Hips',
      category: 'mobility_stability',
      gym: [{ name: 'Pigeon Pose' }],
      home: [{ name: 'Pigeon Pose' }],
      road: [{ name: 'Figure Four Stretch' }],
    },
    {
      generic_name: 'Thoracic Spine Rotation',
      target_muscle_group: 'Thoracic Spine',
      category: 'mobility_stability',
      gym: [{ name: 'Open Book Stretch' }, { name: 'Seated Thoracic Rotation' }],
      home: [{ name: 'Open Book Stretch' }, { name: 'Thread the Needle' }],
      road: [{ name: 'Standing Thoracic Rotation' }],
    },
    {
      generic_name: '90/90 Hip Switch',
      target_muscle_group: 'Hips',
      category: 'mobility_stability',
      gym: [{ name: '90/90 Hip Switch' }, { name: '90/90 with Lean' }],
      home: [{ name: '90/90 Hip Switch' }, { name: '90/90 with Lean' }],
      road: [{ name: '90/90 Hip Switch' }],
    },
    {
      generic_name: 'Ankle Mobility',
      target_muscle_group: 'Ankles',
      category: 'mobility_stability',
      gym: [
        { name: 'Banded Ankle Distraction', equipment: ['Resistance Band'] },
        { name: 'Knee-over-Toe Lunge Stretch' },
      ],
      home: [{ name: 'Wall Ankle Stretch' }, { name: 'Knee-over-Toe Lunge Stretch' }],
      road: [{ name: 'Wall Ankle Stretch' }],
    },
    {
      generic_name: "World's Greatest Stretch",
      target_muscle_group: ['Hips', 'Thoracic Spine', 'Hamstrings'],
      category: 'mobility_stability',
      gym: [{ name: "World's Greatest Stretch" }],
      home: [{ name: "World's Greatest Stretch" }],
      road: [{ name: "World's Greatest Stretch" }],
    },

    // Cardio exercises
    {
      generic_name: 'Running',
      target_muscle_group: 'Legs',
      category: 'cardio',
      gym: [{ name: 'Treadmill Run', equipment: ['Treadmill'] }],
      home: [],
      road: [
        { name: 'Easy Run' },
        { name: 'Interval Run' },
        { name: 'Tempo Run' },
        { name: 'Long Run' },
      ],
    },
    {
      generic_name: 'Cycling',
      target_muscle_group: 'Legs',
      category: 'cardio',
      gym: [
        { name: 'Stationary Bike', equipment: ['Stationary Bike'] },
        { name: 'Spin Class', equipment: ['Spin Bike'] },
      ],
      home: [{ name: 'Stationary Bike', equipment: ['Stationary Bike'] }],
      road: [
        { name: 'Road Cycling', equipment: ['Bike'] },
        { name: 'Hill Climb', equipment: ['Bike'] },
      ],
    },
    {
      generic_name: 'Rowing',
      target_muscle_group: ['Back', 'Legs'],
      category: 'cardio',
      gym: [{ name: 'Rowing Machine', equipment: ['Rowing Machine'] }],
      home: [{ name: 'Rowing Machine', equipment: ['Rowing Machine'] }],
      road: [],
    },
    {
      generic_name: 'Jump Rope',
      target_muscle_group: ['Calves', 'Shoulders'],
      category: 'cardio',
      gym: [{ name: 'Jump Rope', equipment: ['Jump Rope'] }],
      home: [{ name: 'Jump Rope', equipment: ['Jump Rope'] }],
      road: [{ name: 'Jump Rope', equipment: ['Jump Rope'] }],
    },
    {
      generic_name: 'Burpee',
      target_muscle_group: 'Full Body',
      category: 'cardio',
      gym: [{ name: 'Burpee' }, { name: 'Burpee Box Jump', equipment: ['Plyo Box'] }],
      home: [{ name: 'Burpee' }],
      road: [{ name: 'Burpee' }],
    },
    {
      generic_name: 'Stair Climber',
      target_muscle_group: ['Legs', 'Glutes'],
      category: 'cardio',
      gym: [{ name: 'Stair Climber Machine', equipment: ['Stair Climber'] }],
      home: [],
      road: [{ name: 'Stair Sprints' }, { name: 'Hill Sprints' }],
    },
    {
      generic_name: 'Kettlebell Swing',
      target_muscle_group: ['Glutes', 'Hamstrings', 'Core'],
      category: 'cardio',
      gym: [
        { name: 'Kettlebell Swing', equipment: ['Kettlebell'] },
        { name: 'Dumbbell Swing', equipment: ['Dumbbell'] },
      ],
      home: [{ name: 'Kettlebell Swing', equipment: ['Kettlebell'] }],
      road: [],
    },
    {
      generic_name: 'Battle Rope',
      target_muscle_group: ['Shoulders', 'Core', 'Arms'],
      category: 'cardio',
      gym: [
        { name: 'Alternating Waves', equipment: ['Battle Ropes'] },
        { name: 'Double Slam', equipment: ['Battle Ropes'] },
      ],
      home: [],
      road: [],
    },
    {
      generic_name: 'Box Jump',
      target_muscle_group: ['Legs', 'Glutes'],
      category: 'cardio',
      gym: [
        { name: 'Box Jump', equipment: ['Plyo Box'] },
        { name: 'Box Step-down', equipment: ['Plyo Box'] },
      ],
      home: [{ name: 'Squat Jump' }, { name: 'Tuck Jump' }],
      road: [{ name: 'Squat Jump' }, { name: 'Broad Jump' }],
    },
    {
      generic_name: 'Sled Push',
      target_muscle_group: ['Legs', 'Core', 'Shoulders'],
      category: 'cardio',
      gym: [
        { name: 'Sled Push', equipment: ['Sled'] },
        { name: 'Sled Pull', equipment: ['Sled'] },
      ],
      home: [],
      road: [{ name: 'Bear Crawl' }, { name: 'Sprint Intervals' }],
    },

    // Yoga exercises
    {
      generic_name: 'Sun Salutation',
      target_muscle_group: 'Full Body',
      category: 'yoga',
      gym: [{ name: 'Sun Salutation A' }, { name: 'Sun Salutation B' }],
      home: [{ name: 'Sun Salutation A' }, { name: 'Sun Salutation B' }],
      road: [{ name: 'Sun Salutation A' }],
    },
    {
      generic_name: 'Downward Dog',
      target_muscle_group: ['Hamstrings', 'Shoulders', 'Calves'],
      category: 'yoga',
      gym: [{ name: 'Downward Facing Dog' }],
      home: [{ name: 'Downward Facing Dog' }],
      road: [{ name: 'Downward Facing Dog' }],
    },
    {
      generic_name: 'Warrior Pose',
      target_muscle_group: ['Legs', 'Core', 'Hips'],
      category: 'yoga',
      gym: [{ name: 'Warrior I' }, { name: 'Warrior II' }, { name: 'Warrior III' }],
      home: [{ name: 'Warrior I' }, { name: 'Warrior II' }, { name: 'Warrior III' }],
      road: [{ name: 'Warrior I' }, { name: 'Warrior II' }],
    },
    {
      generic_name: "Child's Pose",
      target_muscle_group: ['Hips', 'Back'],
      category: 'yoga',
      gym: [{ name: "Child's Pose" }],
      home: [{ name: "Child's Pose" }],
      road: [{ name: "Child's Pose" }],
    },
    {
      generic_name: 'Tree Pose',
      target_muscle_group: ['Legs', 'Core'],
      category: 'yoga',
      gym: [{ name: 'Tree Pose' }],
      home: [{ name: 'Tree Pose' }],
      road: [{ name: 'Tree Pose' }],
    },
    {
      generic_name: 'Triangle Pose',
      target_muscle_group: ['Legs', 'Obliques', 'Hips'],
      category: 'yoga',
      gym: [{ name: 'Triangle Pose' }, { name: 'Revolved Triangle' }],
      home: [{ name: 'Triangle Pose' }, { name: 'Revolved Triangle' }],
      road: [{ name: 'Triangle Pose' }],
    },
    {
      generic_name: 'Cobra Pose',
      target_muscle_group: ['Back', 'Chest', 'Shoulders'],
      category: 'yoga',
      gym: [{ name: 'Cobra Pose' }, { name: 'Upward Facing Dog' }],
      home: [{ name: 'Cobra Pose' }, { name: 'Upward Facing Dog' }],
      road: [{ name: 'Cobra Pose' }],
    },
    {
      generic_name: 'Bridge Pose',
      target_muscle_group: ['Glutes', 'Spine', 'Chest'],
      category: 'yoga',
      gym: [{ name: 'Bridge Pose' }, { name: 'Wheel Pose' }],
      home: [{ name: 'Bridge Pose' }, { name: 'Supported Bridge' }],
      road: [{ name: 'Bridge Pose' }],
    },
    {
      generic_name: 'Chair Pose',
      target_muscle_group: ['Quadriceps', 'Glutes', 'Core'],
      category: 'yoga',
      gym: [{ name: 'Chair Pose' }, { name: 'Twisted Chair Pose' }],
      home: [{ name: 'Chair Pose' }, { name: 'Twisted Chair Pose' }],
      road: [{ name: 'Chair Pose' }],
    },
    {
      generic_name: 'Plank Pose',
      target_muscle_group: ['Core', 'Shoulders', 'Arms'],
      category: 'yoga',
      gym: [
        { name: 'High Plank Pose' },
        { name: 'Low Plank (Chaturanga)' },
        { name: 'Side Plank Pose' },
      ],
      home: [{ name: 'High Plank Pose' }, { name: 'Low Plank (Chaturanga)' }],
      road: [{ name: 'High Plank Pose' }],
    },
  ]
}
