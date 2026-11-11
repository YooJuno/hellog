const numberFormatter = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 })

export const CATEGORIES = [
  { id: 'CHEST', label: '가슴' },
  { id: 'BACK', label: '등' },
  { id: 'LEGS', label: '하체' },
  { id: 'SHOULDERS', label: '어깨' },
  { id: 'ARMS', label: '팔' },
  { id: 'CORE', label: '복근' },
]

export const EQUIPMENT_TYPES = ['머신', '케이블', '바벨', '덤벨', '맨몸', '기타']

export const MANUFACTURER_OPTIONS = [
  '뉴텍',
  '개선스포츠',
  'DHZ',
  'Hammer Strength',
  'Life Fitness',
  'Technogym',
  'Matrix',
  'Precor',
  '기타',
]

export function categoryLabel(category) {
  return CATEGORIES.find((item) => item.id === category)?.label || '미분류'
}

export function formatNumber(value) {
  return numberFormatter.format(Number(value || 0))
}

export function normalizeSearch(value) {
  return (value || '').toLowerCase().replace(/\s+/g, '')
}

export function groupByEquipment(items) {
  return EQUIPMENT_TYPES.map((type) => ({
    type,
    items: items.filter((item) => item.equipmentType === type),
  })).filter((group) => group.items.length > 0)
}

export function machineManufacturer(machine) {
  return machine?.manufacturer?.trim() || ''
}

export function machineMeta(machine) {
  const parts = [machine.equipmentType]
  if (machineManufacturer(machine)) parts.push(machineManufacturer(machine))
  return parts.join(' · ')
}

export function findMachine(machines, exercise) {
  if (exercise.machineId) {
    const byId = machines.find((machine) => String(machine.id) === String(exercise.machineId))
    if (byId) return byId
  }
  return machines.find(
    (machine) =>
      machine.name === exercise.exerciseName &&
      (!exercise.category || machine.category === exercise.category),
  )
}

export function exerciseManufacturer(machines, exercise) {
  return exercise.manufacturer || machineManufacturer(findMachine(machines, exercise))
}

export function exerciseCategory(machines, exercise) {
  return exercise.category || findMachine(machines, exercise)?.category || ''
}

export function toPayload(form, machines) {
  return {
    workoutDate: form.workoutDate,
    title: form.title.trim() || '운동 기록',
    memo: form.memo?.trim() || null,
    exercises: form.exercises
      .filter((exercise) => exercise.exerciseName.trim())
      .map((exercise) => ({
        category: exercise.category || null,
        exerciseName: exercise.exerciseName.trim(),
        equipment: exercise.equipment?.trim() || null,
        manufacturer: exerciseManufacturer(machines, exercise) || null,
        memo: exercise.memo?.trim() || null,
        sets: exercise.sets.map((set) => ({
          weightKg: set.weightKg,
          reps: set.reps,
        })),
      })),
  }
}

export function fromWorkout(workout, machines) {
  return {
    workoutDate: workout.workoutDate,
    title: workout.title,
    memo: workout.memo || '',
    exercises: workout.exercises.map((exercise) => {
      const machine = findMachine(machines, exercise)
      return {
        uiId: crypto.randomUUID(),
        category: exercise.category || machine?.category || 'CHEST',
        machineId: machine ? String(machine.id) : '',
        exerciseName: exercise.exerciseName,
        equipment: exercise.equipment || machine?.equipmentType || '',
        manufacturer: exercise.manufacturer || machine?.manufacturer || '',
        memo: exercise.memo || '',
        sets: exercise.sets.map((set) => ({
          weightKg: Number(set.weightKg),
          reps: set.reps,
        })),
      }
    }),
  }
}

export function compareWorkouts(left, right) {
  return right.workoutDate.localeCompare(left.workoutDate)
    || (right.createdAt || '').localeCompare(left.createdAt || '')
    || right.id.localeCompare(left.id)
}

export function mergeWorkout(workouts, saved) {
  return [...workouts.filter((workout) => workout.id !== saved.id), saved].sort(compareWorkouts)
}

export function compareMachines(left, right) {
  return left.category.localeCompare(right.category)
    || left.equipmentType.localeCompare(right.equipmentType, 'ko')
    || left.name.localeCompare(right.name, 'ko')
}

export function workoutSearchText(workout, machines) {
  return normalizeSearch([
    workout.title, workout.memo,
    ...workout.exercises.flatMap((exercise) => [
      exercise.exerciseName, exerciseManufacturer(machines, exercise), exercise.memo,
    ]),
  ].filter(Boolean).join(' '))
}
