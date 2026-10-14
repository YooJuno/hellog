import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { DEFAULT_MACHINES } from '../data/defaultMachines.js'
import { friendlyFirebaseError, requireFirebaseUser } from './firebaseClient.js'

/**
 * All operations use the signed-in Firebase uid; no caller-provided owner IDs.
 * Workouts live at users/{uid}/workouts/{id}, with embedded exercises/sets.
 * list/save return app models with string IDs, ISO timestamps, and derived totals.
 * Personal machines live at users/{uid}/machines/{id}; static defaults are merged
 * with them and filtered by users/{uid}/hiddenMachines/{default-id}.
 * delete operations resolve without a result. Firestore reads are one-off.
 */

const CATEGORIES = new Set(['CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE'])
const EQUIPMENT_TYPES = new Set(['머신', '케이블', '바벨', '덤벨', '맨몸', '기타'])
const DEFAULT_MACHINE_BY_ID = new Map(DEFAULT_MACHINES.map((machine) => [machine.id, machine]))

function requiredText(value, label, limit = 100) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${label}을 입력해주세요.`)
  if (text.length > limit) throw new Error(`${label}은 ${limit}자 이내로 입력해주세요.`)
  return text
}

function optionalText(value, label, limit = 2000) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${label}을 확인해주세요.`)
  const text = value.trim()
  if (text.length > limit) throw new Error(`${label}은 ${limit}자 이내로 입력해주세요.`)
  return text || null
}

function categoryValue(value, required = false) {
  if (!value && !required) return null
  if (!CATEGORIES.has(value)) throw new Error('운동 부위를 선택해주세요.')
  return value
}

function numberValue(value, label) {
  if (value == null || (typeof value === 'string' && !value.trim())) throw new Error(`${label}을 입력해주세요.`)
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${label}을 확인해주세요.`)
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label}을 숫자로 입력해주세요.`)
  return number
}

function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('운동 날짜를 선택해주세요.')
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('올바른 운동 날짜를 선택해주세요.')
  return value
}

function documentId(value) {
  const id = String(value || '')
  if (!id || id.includes('/') || id === '.' || id === '..') throw new Error('기록을 찾을 수 없습니다.')
  return id
}

function timestampString(value) {
  if (!value) return null
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Pure normalization shared by writes and reads; totals are derived, never trusted. */
export function normalizeWorkoutPayload(payload) {
  if (!Array.isArray(payload?.exercises) || payload.exercises.length < 1) throw new Error('운동을 하나 이상 선택해주세요.')
  if (payload.exercises.length > 30) throw new Error('한 기록에는 운동을 최대 30개까지 입력할 수 있습니다.')
  return {
    workoutDate: dateValue(payload.workoutDate),
    title: requiredText(payload.title, '루틴 이름'),
    memo: optionalText(payload.memo, '메모'),
    exercises: payload.exercises.map((exercise) => {
      if (!Array.isArray(exercise?.sets) || !exercise.sets.length) throw new Error('운동마다 세트를 하나 이상 입력해주세요.')
      const sets = exercise.sets.map((set) => {
        const weightKg = numberValue(set?.weightKg, '무게')
        const reps = numberValue(set?.reps, '횟수')
        if (weightKg < 0) throw new Error('무게는 0 이상으로 입력해주세요.')
        if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('횟수는 1 이상의 정수로 입력해주세요.')
        if (!Number.isFinite(weightKg * reps)) throw new Error('무게와 횟수를 확인해주세요.')
        return { weightKg, reps }
      })
      return {
        category: categoryValue(exercise.category),
        exerciseName: requiredText(exercise.exerciseName, '운동 이름'),
        equipment: optionalText(exercise.equipment, '운동 방식', 100),
        manufacturer: optionalText(exercise.manufacturer, '제조사', 100),
        memo: optionalText(exercise.memo, '운동 메모'),
        sets,
      }
    }),
  }
}

export function workoutFromDocument(id, data) {
  const normalized = normalizeWorkoutPayload(data)
  let totalSets = 0
  let totalReps = 0
  let totalVolume = 0
  const exercises = normalized.exercises.map((exercise, exerciseIndex) => ({
    ...exercise,
    id: `exercise-${exerciseIndex + 1}`,
    position: exerciseIndex,
    sets: exercise.sets.map((set, setIndex) => {
      totalSets += 1
      totalReps += set.reps
      totalVolume += set.weightKg * set.reps
      return { ...set, id: `set-${exerciseIndex + 1}-${setIndex + 1}`, setNumber: setIndex + 1 }
    }),
  }))
  if (!Number.isFinite(totalVolume) || !Number.isSafeInteger(totalReps)) throw new Error('세트의 무게와 횟수를 확인해주세요.')
  return {
    ...normalized,
    id: documentId(id),
    createdAt: timestampString(data.createdAt),
    updatedAt: timestampString(data.updatedAt),
    totalSets,
    totalReps,
    totalVolume,
    exercises,
  }
}

export function normalizeMachinePayload(payload) {
  if (!EQUIPMENT_TYPES.has(payload?.equipmentType)) throw new Error('운동 방식을 선택해주세요.')
  return {
    category: categoryValue(payload.category, true),
    name: requiredText(payload.name, '운동 이름'),
    equipmentType: payload.equipmentType,
    manufacturer: payload.equipmentType === '머신' ? optionalText(payload.manufacturer, '제조사', 100) : null,
  }
}

function machineFromDocument(id, data) {
  return {
    ...normalizeMachinePayload(data),
    id: documentId(id),
    defaultMachine: false,
    createdAt: timestampString(data.createdAt),
    updatedAt: timestampString(data.updatedAt),
  }
}

function machineKey(machine) {
  return `${machine.category}::${machine.name.trim().toLowerCase()}`
}

export async function listWorkouts() {
  try {
    const { uid, db } = requireFirebaseUser()
    const snapshot = await getDocs(collection(db, 'users', uid, 'workouts'))
    return snapshot.docs
      .map((item) => workoutFromDocument(item.id, item.data()))
      .sort((left, right) => right.workoutDate.localeCompare(left.workoutDate)
        || (right.createdAt || '').localeCompare(left.createdAt || '')
        || right.id.localeCompare(left.id))
  } catch (error) {
    throw friendlyFirebaseError(error, '기록을 불러오지 못했습니다.')
  }
}

export async function saveWorkout(payload, id = null) {
  try {
    const normalized = normalizeWorkoutPayload(payload)
    // Validate derived totals before committing the embedded sets.
    workoutFromDocument(id || 'new-workout', normalized)
    const { uid, db } = requireFirebaseUser()
    const reference = id
      ? doc(db, 'users', uid, 'workouts', documentId(id))
      : doc(collection(db, 'users', uid, 'workouts'))
    if (id) {
      await updateDoc(reference, { ...normalized, updatedAt: serverTimestamp() })
    } else {
      const timestamp = serverTimestamp()
      await setDoc(reference, { ...normalized, createdAt: timestamp, updatedAt: timestamp })
    }
    const snapshot = await getDoc(reference)
    return workoutFromDocument(reference.id, snapshot.data())
  } catch (error) {
    throw friendlyFirebaseError(error, '저장에 실패했습니다.')
  }
}

export async function deleteWorkout(id) {
  try {
    const { uid, db } = requireFirebaseUser()
    await deleteDoc(doc(db, 'users', uid, 'workouts', documentId(id)))
  } catch (error) {
    throw friendlyFirebaseError(error, '기록을 삭제하지 못했습니다.')
  }
}

async function visibleMachines(db, uid) {
  const [customSnapshot, hiddenSnapshot] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'machines')),
    getDocs(collection(db, 'users', uid, 'hiddenMachines')),
  ])
  const hiddenIds = new Set(hiddenSnapshot.docs.filter((item) => item.data().hidden === true).map((item) => item.id))
  const customMachines = customSnapshot.docs.map((item) => machineFromDocument(item.id, item.data()))
  const customKeys = new Set(customMachines.map(machineKey))
  return [
    ...DEFAULT_MACHINES.filter((machine) => !hiddenIds.has(machine.id) && !customKeys.has(machineKey(machine))),
    ...customMachines,
  ].sort((left, right) => left.category.localeCompare(right.category)
    || left.equipmentType.localeCompare(right.equipmentType, 'ko')
    || left.name.localeCompare(right.name, 'ko'))
}

export async function listMachines() {
  try {
    const { uid, db } = requireFirebaseUser()
    return await visibleMachines(db, uid)
  } catch (error) {
    throw friendlyFirebaseError(error, '운동 목록을 불러오지 못했습니다.')
  }
}

export async function saveMachine(payload) {
  try {
    const normalized = normalizeMachinePayload(payload)
    const { uid, db } = requireFirebaseUser()
    const machines = await visibleMachines(db, uid)
    if (machines.some((machine) => machineKey(machine) === machineKey(normalized))) throw new Error('이미 등록된 운동입니다.')
    const reference = doc(collection(db, 'users', uid, 'machines'))
    const timestamp = serverTimestamp()
    await setDoc(reference, { ...normalized, createdAt: timestamp, updatedAt: timestamp })
    const snapshot = await getDoc(reference)
    return machineFromDocument(reference.id, snapshot.data())
  } catch (error) {
    throw friendlyFirebaseError(error, '운동을 추가하지 못했습니다.')
  }
}

export async function deleteMachine(id) {
  try {
    const normalizedId = documentId(id)
    const { uid, db } = requireFirebaseUser()
    if (DEFAULT_MACHINE_BY_ID.has(normalizedId)) {
      await setDoc(doc(db, 'users', uid, 'hiddenMachines', normalizedId), { hidden: true })
    } else {
      await deleteDoc(doc(db, 'users', uid, 'machines', normalizedId))
    }
  } catch (error) {
    throw friendlyFirebaseError(error, '운동을 삭제하지 못했습니다.')
  }
}
