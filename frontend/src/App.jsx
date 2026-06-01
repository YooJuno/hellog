import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  Copy,
  Dumbbell,
  Flame,
  History,
  Layers3,
  ListPlus,
  Loader2,
  Pencil,
  LogIn,
  LogOut,
  PieChart,
  Plus,
  Save,
  Search,
  Target,
  Trash2,
} from 'lucide-react'
import './App.css'

const today = new Date().toISOString().slice(0, 10)
const todayTimestamp = new Date(`${today}T00:00:00`).getTime()

const CATEGORIES = [
  { id: 'CHEST', label: '가슴' },
  { id: 'BACK', label: '등' },
  { id: 'LEGS', label: '하체' },
  { id: 'SHOULDERS', label: '어깨' },
  { id: 'ARMS', label: '팔' },
  { id: 'CORE', label: '복근' },
]

const EQUIPMENT_TYPES = ['머신', '케이블', '바벨', '덤벨', '맨몸', '기타']
const MANUFACTURER_OPTIONS = [
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

const blankSet = () => ({ weightKg: 20, reps: 10 })
const blankExercise = () => ({
  category: 'CHEST',
  machineId: '',
  exerciseName: '',
  equipment: '',
  memo: '',
  sets: [blankSet()],
})
const blankWorkout = () => ({
  workoutDate: today,
  title: '오늘 운동',
  memo: '',
  exercises: [blankExercise()],
})
const blankMachine = () => ({
  category: 'CHEST',
  name: '',
  equipmentType: '머신',
  manufacturer: '',
  customManufacturer: '',
})

const DRAFT_STORAGE_PREFIX = 'health-logger-workout-draft-v1'

function isDefaultSet(set) {
  return Number(set?.weightKg || 0) === 20 && Number(set?.reps || 0) === 10
}

function hasDraftContent(form, editingId) {
  if (editingId) return true
  if ((form.title || '').trim() && form.title.trim() !== '오늘 운동') return true
  if ((form.memo || '').trim()) return true
  if (form.workoutDate !== today) return true

  return form.exercises.some((exercise) => {
    if ((exercise.exerciseName || '').trim()) return true
    if ((exercise.memo || '').trim()) return true
    if (exercise.category !== 'CHEST') return true
    if (exercise.machineId || exercise.equipment) return true
    if (exercise.sets.length !== 1) return true
    return !isDefaultSet(exercise.sets[0])
  })
}

function draftStorageKey(userId) {
  return `${DRAFT_STORAGE_PREFIX}:${userId}`
}

function formatDraftTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function percentageChange(current, previous) {
  if (!previous && !current) return 0
  if (!previous) return 100
  return ((current - previous) / previous) * 100
}

function formatSignedNumber(value, suffix = '') {
  if (!Number.isFinite(value)) return `0${suffix}`
  const rounded = Math.abs(value) >= 10
    ? Math.round(value)
    : Math.round(value * 10) / 10
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatNumber(Math.abs(rounded))}${suffix}`
}

function buildSparklinePoints(values, width = 220, height = 58) {
  if (!values.length) return ''
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1

  return values
    .map((value, index) => {
      const x = (width / (values.length - 1)) * index
      const y = height - ((value - min) / range) * height
      return `${x},${Number(y.toFixed(2))}`
    })
    .join(' ')
}

function categoryLabel(category) {
  return CATEGORIES.find((item) => item.id === category)?.label || '미분류'
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

function normalizeSearch(value) {
  return (value || '').toLowerCase().replace(/\s+/g, '')
}

function groupByEquipment(items) {
  return EQUIPMENT_TYPES.map((type) => ({
    type,
    items: items.filter((item) => item.equipmentType === type),
  })).filter((group) => group.items.length > 0)
}

function exerciseKey(item) {
  return `${item.category}::${item.name}`.toLowerCase()
}

function machineManufacturer(machine) {
  return machine?.manufacturer?.trim() || ''
}

function exerciseManufacturer(machines, exercise) {
  return machineManufacturer(findMachine(machines, exercise))
}

function machineMeta(machine) {
  const parts = [machine.equipmentType]
  if (machineManufacturer(machine)) parts.push(machineManufacturer(machine))
  return parts.join(' · ')
}

function matchesExerciseQuery(item, query) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return false

  const candidates = [
    item.name,
    item.equipmentType,
    ...(item.aliases || []),
  ]

  return candidates.some((candidate) => normalizeSearch(candidate).includes(normalizedQuery))
}

async function getErrorMessage(response, fallback) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null)
    if (payload?.message) return payload.message
    if (payload?.error) return payload.error
  }
  const text = await response.text().catch(() => '')
  return text || fallback
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  })
  return response
}

function findMachine(machines, exercise) {
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

function exerciseCategory(machines, exercise) {
  return exercise.category || findMachine(machines, exercise)?.category || ''
}

function toPayload(form) {
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
        memo: exercise.memo?.trim() || null,
        sets: exercise.sets.map((set) => ({
          weightKg: Number(set.weightKg || 0),
          reps: Number(set.reps || 1),
        })),
      })),
  }
}

function normalizedManufacturer(machineForm) {
  if (machineForm.equipmentType !== '머신') return null
  if (machineForm.manufacturer === '기타') {
    return machineForm.customManufacturer.trim() || null
  }
  return machineForm.manufacturer || null
}

function fromWorkout(workout, machines) {
  return {
    workoutDate: workout.workoutDate,
    title: workout.title,
    memo: workout.memo || '',
    exercises: workout.exercises.map((exercise) => {
      const machine = findMachine(machines, exercise)
      return {
        category: exercise.category || machine?.category || 'CHEST',
        machineId: machine ? String(machine.id) : '',
        exerciseName: exercise.exerciseName,
        equipment: exercise.equipment || machine?.equipmentType || '',
        memo: exercise.memo || '',
        sets: exercise.sets.map((set) => ({
          weightKg: Number(set.weightKg),
          reps: set.reps,
        })),
      }
    }),
  }
}

function App() {
  const [authStatus, setAuthStatus] = useState({ checked: false, authenticated: false, user: null, googleLoginEnabled: true })
  const [activeTab, setActiveTab] = useState('log')
  const [workouts, setWorkouts] = useState([])
  const [machines, setMachines] = useState([])
  const [form, setForm] = useState(blankWorkout)
  const [machineForm, setMachineForm] = useState(blankMachine)
  const [filters, setFilters] = useState({ query: '', category: 'ALL', from: '', to: '' })
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftMeta, setDraftMeta] = useState({ ready: false, restored: false, savedAt: '' })
  const draftUserRef = useRef(null)

  const selectedWorkout = workouts[0]
  const weeklyVolume = useMemo(
    () => workouts.slice(0, 7).reduce((sum, workout) => sum + Number(workout.totalVolume || 0), 0),
    [workouts],
  )

  const insights = useMemo(() => {
    if (!workouts.length) return null

    const sorted = [...workouts].sort((left, right) => {
      if (left.workoutDate !== right.workoutDate) {
        return right.workoutDate.localeCompare(left.workoutDate)
      }
      return (right.id || 0) - (left.id || 0)
    })

    const recent = sorted.slice(0, 4)
    const previous = sorted.slice(4, 8)
    const averageVolumeRecent = recent.reduce((sum, workout) => sum + Number(workout.totalVolume || 0), 0) / Math.max(recent.length, 1)
    const averageVolumePrevious = previous.reduce((sum, workout) => sum + Number(workout.totalVolume || 0), 0) / Math.max(previous.length, 1)
    const volumeChange = percentageChange(averageVolumeRecent, averageVolumePrevious)

    const weeklyBuckets = Array.from({ length: 4 }, (_, index) => {
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      end.setDate(end.getDate() - index * 7)
      const start = new Date(end)
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      const count = sorted.filter((workout) => {
        const date = new Date(workout.workoutDate)
        return date >= start && date <= end
      }).length
      return {
        label: index === 0 ? '이번주' : `${index}주 전`,
        count,
      }
    }).reverse()

    const recentCategorySource = sorted.filter((workout) => {
      const diff = Math.floor((todayTimestamp - new Date(workout.workoutDate).getTime()) / 86400000)
      return diff <= 30
    })
    const scopedCategorySource = recentCategorySource.length ? recentCategorySource : sorted
    const categoryTotals = new Map()
    scopedCategorySource.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const category = exerciseCategory(machines, exercise) || 'UNKNOWN'
        const current = categoryTotals.get(category) || 0
        categoryTotals.set(category, current + (exercise.sets?.length || 0))
      })
    })

    const topCategories = [...categoryTotals.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 4)

    const totalCategorySets = topCategories.reduce((sum, item) => sum + item.count, 0) || 1
    const mainCategory = topCategories[0]

    const volumeSeries = sorted
      .slice(0, 6)
      .reverse()
      .map((workout) => Number(workout.totalVolume || 0))

    const exerciseSessions = new Map()
    sorted.forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const current = exerciseSessions.get(exercise.exerciseName) || []
        current.push({
          date: workout.workoutDate,
          volume: (exercise.sets || []).reduce(
            (sum, set) => sum + Number(set.weightKg || 0) * Number(set.reps || 0),
            0,
          ),
          topWeight: Math.max(...(exercise.sets || []).map((set) => Number(set.weightKg || 0)), 0),
        })
        exerciseSessions.set(exercise.exerciseName, current)
      })
    })

    const exerciseDeltas = [...exerciseSessions.entries()]
      .map(([name, sessions]) => {
        if (sessions.length < 2) return null
        const [latest, previousSession] = sessions
        return {
          name,
          deltaVolume: latest.volume - previousSession.volume,
          latestVolume: latest.volume,
          previousVolume: previousSession.volume,
          latestWeight: latest.topWeight,
          previousWeight: previousSession.topWeight,
        }
      })
      .filter(Boolean)

    const topImproved = [...exerciseDeltas]
      .filter((item) => item.deltaVolume > 0)
      .sort((left, right) => right.deltaVolume - left.deltaVolume)[0] || null
    const topDropped = [...exerciseDeltas]
      .filter((item) => item.deltaVolume < 0)
      .sort((left, right) => left.deltaVolume - right.deltaVolume)[0] || null

    return {
      volumeChange,
      averageVolumeRecent,
      averageVolumePrevious,
      weeklyBuckets,
      topCategories,
      totalCategorySets,
      mainCategory,
      volumeSeries,
      topImproved,
      topDropped,
      recentCount: recent.length,
    }
  }, [machines, workouts])

  const machinesByCategory = useMemo(
    () =>
      CATEGORIES.reduce((acc, category) => {
        acc[category.id] = machines.filter((machine) => machine.category === category.id)
        return acc
      }, {}),
    [machines],
  )

  const exerciseCatalog = useMemo(() => {
    return machines.map((machine) => ({
      category: machine.category,
      name: machine.name,
      equipmentType: machine.equipmentType,
      manufacturer: machine.manufacturer || null,
      aliases: [machine.name],
    }))
  }, [machines])

  const machineNameSuggestions = useMemo(() => {
    const query = machineForm.name.trim()
    if (!query) return []

    return exerciseCatalog
      .filter((item) => item.category === machineForm.category)
      .filter((item) => matchesExerciseQuery(item, query))
      .slice(0, 8)
  }, [exerciseCatalog, machineForm.category, machineForm.name])

  const filteredWorkouts = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    return workouts.filter((workout) => {
      const dateMatch =
        (!filters.from || workout.workoutDate >= filters.from) &&
        (!filters.to || workout.workoutDate <= filters.to)
      if (!dateMatch) return false

      const categoryMatch =
        filters.category === 'ALL' ||
        workout.exercises.some((exercise) => exerciseCategory(machines, exercise) === filters.category)
      if (!categoryMatch) return false

      if (!query) return true
      return (
        workout.title.toLowerCase().includes(query) ||
        workout.exercises.some((exercise) =>
          `${exercise.exerciseName} ${exerciseManufacturer(machines, exercise)} ${exercise.memo || ''}`
            .toLowerCase()
            .includes(query),
        )
      )
    })
  }, [filters, machines, workouts])

  async function loadWorkouts() {
    const response = await apiFetch('/api/workouts')
    if (!response.ok) throw new Error('기록을 불러오지 못했습니다.')
    setWorkouts(await response.json())
  }

  async function loadMachines() {
    const response = await apiFetch('/api/machines')
    if (!response.ok) throw new Error('운동 목록을 불러오지 못했습니다.')
    setMachines(await response.json())
  }

  const persistDraft = useCallback((nextForm = form, nextEditingId = editingId) => {
    if (!authStatus.authenticated || !authStatus.user?.id) return null

    try {
      const key = draftStorageKey(authStatus.user.id)
      if (!hasDraftContent(nextForm, nextEditingId)) {
        window.localStorage.removeItem(key)
        setDraftMeta((current) => ({ ...current, restored: false, savedAt: '' }))
        return null
      }

      const snapshot = {
        form: nextForm,
        editingId: nextEditingId,
        savedAt: new Date().toISOString(),
      }
      window.localStorage.setItem(key, JSON.stringify(snapshot))
      setDraftMeta((current) => ({
        ...current,
        ready: true,
        restored: false,
        savedAt: snapshot.savedAt,
      }))
      return snapshot
    } catch {
      return null
    }
  }, [authStatus.authenticated, authStatus.user, editingId, form])

  const clearDraft = useCallback(({ resetForm = false } = {}) => {
    if (authStatus.user?.id) {
      try {
        window.localStorage.removeItem(draftStorageKey(authStatus.user.id))
      } catch {
        // Ignore storage failures and keep the visible form usable.
      }
    }

    setDraftMeta((current) => ({ ...current, restored: false, savedAt: '' }))

    if (resetForm) {
      setEditingId(null)
      setForm(blankWorkout())
    }
  }, [authStatus.user])

  useEffect(() => {
    let ignore = false

    async function loadAuthAndData() {
      try {
        const authResponse = await apiFetch('/api/auth/me')
        const authPayload = await authResponse.json()
        if (ignore) return
        setAuthStatus({
          checked: true,
          authenticated: authPayload.authenticated,
          user: authPayload.user,
          googleLoginEnabled: authPayload.googleLoginEnabled,
        })

        if (!authPayload.authenticated) {
          setWorkouts([])
          setMachines([])
          return
        }

        const [workoutsResponse, machinesResponse] = await Promise.all([
          apiFetch('/api/workouts'),
          apiFetch('/api/machines'),
        ])
        if (!workoutsResponse.ok) throw new Error('기록을 불러오지 못했습니다.')
        if (!machinesResponse.ok) throw new Error('운동 목록을 불러오지 못했습니다.')

        const [nextWorkouts, nextMachines] = await Promise.all([
          workoutsResponse.json(),
          machinesResponse.json(),
        ])
        if (ignore) return
        setWorkouts(nextWorkouts)
        setMachines(nextMachines)
      } catch (err) {
        if (!ignore) setError(err.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadAuthAndData()
    return () => {
      ignore = true
    }
  }, [])

  // Periodically check session validity (every 5 minutes)
  useEffect(() => {
    if (!authStatus.checked || !authStatus.authenticated) return

    const checkSessionInterval = setInterval(async () => {
      try {
        const response = await apiFetch('/api/auth/me')
        const payload = await response.json()
        
        // If session expired, update auth status
        if (!payload.authenticated && authStatus.authenticated) {
          setAuthStatus({
            checked: true,
            authenticated: false,
            user: null,
            googleLoginEnabled: authStatus.googleLoginEnabled,
          })
          setWorkouts([])
          setMachines([])
        }
      } catch {
        // Ignore network errors, session might still be valid
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(checkSessionInterval)
  }, [authStatus.checked, authStatus.authenticated, authStatus.googleLoginEnabled])

  useEffect(() => {
    if (!authStatus.authenticated || !authStatus.user?.id) {
      draftUserRef.current = null
      queueMicrotask(() => {
        setDraftMeta({ ready: false, restored: false, savedAt: '' })
      })
      return
    }

    if (draftUserRef.current === authStatus.user.id) return
    draftUserRef.current = authStatus.user.id

    try {
      const raw = window.localStorage.getItem(draftStorageKey(authStatus.user.id))
      if (!raw) {
        queueMicrotask(() => {
          setDraftMeta({ ready: true, restored: false, savedAt: '' })
        })
        return
      }

      const snapshot = JSON.parse(raw)
      if (snapshot?.form) {
        queueMicrotask(() => {
          setForm(snapshot.form)
          setEditingId(snapshot.editingId ?? null)
          setActiveTab('log')
          setDraftMeta({
            ready: true,
            restored: true,
            savedAt: snapshot.savedAt || '',
          })
        })
        return
      }
    } catch {
      // Ignore malformed local drafts and continue with a clean form.
    }

    queueMicrotask(() => {
      setDraftMeta({ ready: true, restored: false, savedAt: '' })
    })
  }, [authStatus.authenticated, authStatus.user?.id])

  useEffect(() => {
    if (!authStatus.authenticated || !authStatus.user?.id || !draftMeta.ready) return undefined

    const timer = window.setTimeout(() => {
      persistDraft(form, editingId)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [authStatus.authenticated, authStatus.user?.id, draftMeta.ready, form, editingId, persistDraft])

  useEffect(() => {
    if (!authStatus.authenticated || !authStatus.user?.id || !draftMeta.ready) return undefined

    const flushDraft = () => {
      persistDraft(form, editingId)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraft()
      }
    }

    window.addEventListener('pagehide', flushDraft)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flushDraft)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authStatus.authenticated, authStatus.user?.id, draftMeta.ready, form, editingId, persistDraft])

  function updateExercise(index, field, value) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, exerciseIndex) => {
        if (exerciseIndex !== index) return exercise
        if (field === 'category') {
          return { ...exercise, category: value, machineId: '', exerciseName: '', equipment: '' }
        }
        return { ...exercise, [field]: value }
      }),
    }))
  }

  function selectMachine(exerciseIndex, machineId) {
    const machine = machines.find((item) => String(item.id) === String(machineId))
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex && machine
          ? {
              ...exercise,
              category: machine.category,
              machineId: String(machine.id),
              exerciseName: machine.name,
              equipment: machine.equipmentType,
            }
          : exercise,
      ),
    }))
  }

  function updateSet(exerciseIndex, setIndex, field, value) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, currentExerciseIndex) =>
        currentExerciseIndex === exerciseIndex
          ? {
              ...exercise,
              sets: exercise.sets.map((set, currentSetIndex) =>
                currentSetIndex === setIndex ? { ...set, [field]: value } : set,
              ),
            }
          : exercise,
      ),
    }))
  }

  function addExercise() {
    setForm((current) => ({ ...current, exercises: [...current.exercises, blankExercise()] }))
  }

  function removeExercise(index) {
    setForm((current) => ({
      ...current,
      exercises:
        current.exercises.length === 1
          ? [blankExercise()]
          : current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index),
    }))
  }

  function addSet(exerciseIndex) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex ? { ...exercise, sets: [...exercise.sets, blankSet()] } : exercise,
      ),
    }))
  }

  function removeSet(exerciseIndex, setIndex) {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? {
              ...exercise,
              sets:
                exercise.sets.length === 1
                  ? [blankSet()]
                  : exercise.sets.filter((_, currentSetIndex) => currentSetIndex !== setIndex),
            }
          : exercise,
      ),
    }))
  }

  async function saveWorkout(event) {
    event.preventDefault()
    const payload = toPayload(form)
    if (payload.exercises.length === 0) {
      setError('부위와 운동을 하나 이상 선택해주세요.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await apiFetch(editingId ? `/api/workouts/${editingId}` : '/api/workouts', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await getErrorMessage(response, '저장에 실패했습니다.'))
      clearDraft()
      setForm(blankWorkout())
      setEditingId(null)
      setActiveTab('history')
      await loadWorkouts()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkout(id) {
    setError('')
    const response = await apiFetch(`/api/workouts/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      setError(await getErrorMessage(response, '삭제에 실패했습니다.'))
      return
    }
    if (editingId === id) {
      clearDraft()
      setEditingId(null)
      setForm(blankWorkout())
    }
    await loadWorkouts()
  }

  function editWorkout(workout) {
    setEditingId(workout.id)
    setForm(fromWorkout(workout, machines))
    setDraftMeta((current) => ({ ...current, restored: false }))
    setActiveTab('log')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function duplicateWorkout(workout) {
    setEditingId(null)
    setForm({
      ...fromWorkout(workout, machines),
      workoutDate: today,
    })
    setDraftMeta((current) => ({ ...current, restored: false }))
    setActiveTab('log')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startNewWorkout() {
    clearDraft({ resetForm: true })
  }

  async function saveMachine(event) {
    event.preventDefault()
    if (!machineForm.name.trim()) {
      setError('운동 이름을 입력해주세요.')
      return
    }
    setError('')
    const response = await apiFetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: machineForm.category,
        name: machineForm.name,
        equipmentType: machineForm.equipmentType,
        manufacturer: normalizedManufacturer(machineForm),
      }),
    })
    if (!response.ok) {
      setError(await getErrorMessage(response, '운동 추가에 실패했습니다.'))
      return
    }
    setMachineForm(blankMachine())
    await loadMachines()
  }

  async function deleteMachine(id) {
    setError('')
    const response = await apiFetch(`/api/machines/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      setError(await getErrorMessage(response, '운동 삭제에 실패했습니다.'))
      return
    }
    await loadMachines()
  }

  function applyMachineSuggestion(suggestion) {
    setMachineForm((current) => ({
      ...current,
      category: suggestion.category,
      name: suggestion.name,
      equipmentType: suggestion.equipmentType,
      manufacturer:
        suggestion.equipmentType === '머신'
          ? suggestion.manufacturer || current.manufacturer
          : '',
      customManufacturer: '',
    }))
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    window.location.reload()
  }

  function renderLoginPrompt(title, description) {
    return (
      <section className="locked-panel">
        <div className="locked-panel__content">
          <p className="eyebrow">Members</p>
          <h2>{title}</h2>
          <p>{description}</p>
          {authStatus.googleLoginEnabled ? (
            <a className="auth-button" href="/oauth2/authorization/google">
              <LogIn size={18} />
              Google로 로그인
            </a>
          ) : (
            <p className="alert auth-alert">Google OAuth 설정이 아직 연결되지 않았습니다.</p>
          )}
        </div>
      </section>
    )
  }

  if (loading && !authStatus.checked) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-panel">
          <Loader2 className="spin muted" size={28} />
          <h1>로그인 확인 중</h1>
          <p>사용자별 운동 기록을 불러오고 있어요.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Health Logger</p>
          <h1>운동 기록</h1>
        </div>
        <div className="topbar-actions">
          <div className="today-pill">
            <CalendarDays size={18} />
            {today}
          </div>
          {authStatus.authenticated ? (
            <div className="user-pill">
              {authStatus.user?.pictureUrl ? (
                <img alt="" src={authStatus.user.pictureUrl} />
              ) : (
                <span>{authStatus.user?.name?.slice(0, 1) || 'U'}</span>
              )}
              <strong>{authStatus.user?.name || '회원'}</strong>
              <button type="button" onClick={logout} title="로그아웃" aria-label="로그아웃">
                <LogOut size={16} />
              </button>
            </div>
          ) : authStatus.googleLoginEnabled ? (
            <a className="auth-button topbar-login" href="/oauth2/authorization/google">
              <LogIn size={18} />
              로그인
            </a>
          ) : (
            <div className="topbar-status">Google 로그인 준비 중</div>
          )}
        </div>
      </section>

      {!authStatus.authenticated && (
        <section className="auth-banner">
          <div>
            <p className="eyebrow">Personal sync</p>
            <h2>로그인하여 운동정보를 기록하세요.</h2>
            <p>기록, 운동 목록, 메모를 기기 바꿔도 그대로 이어서 볼 수 있어요.</p>
          </div>
          {authStatus.googleLoginEnabled ? (
            <a className="auth-button" href="/oauth2/authorization/google">
              <LogIn size={18} />
              Google로 로그인
            </a>
          ) : (
            <p className="alert auth-alert">Google OAuth 설정이 아직 연결되지 않았습니다.</p>
          )}
        </section>
      )}

      <nav className="app-tabs" aria-label="화면 전환">
        <button
          className={activeTab === 'log' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('log')}
        >
          <Dumbbell size={18} />
          기록하기
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('history')}
        >
          <History size={18} />
          기록보기
        </button>
        <button
          className={activeTab === 'gym' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('gym')}
        >
          <Layers3 size={18} />
          운동 목록
        </button>
      </nav>

      {error && <p className="alert">{error}</p>}

      {activeTab === 'log' && (
        authStatus.authenticated ? (
        <form className="planner" onSubmit={saveWorkout}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">{editingId ? 'Edit routine' : 'New routine'}</p>
              <h2>{editingId ? '기록 수정' : '오늘 루틴 입력'}</h2>
            </div>
            <button className="icon-button primary" type="submit" aria-label="저장" title="저장">
              {saving ? <Loader2 className="spin" size={19} /> : <Save size={19} />}
            </button>
          </div>

          <div className="draft-strip">
            <div className="draft-strip__items">
              {editingId && <span className="draft-pill accent">이전 기록 수정 중</span>}
              {draftMeta.restored && <span className="draft-pill">임시 저장 복구됨</span>}
              {draftMeta.savedAt && (
                <span className="draft-pill">임시 저장 {formatDraftTime(draftMeta.savedAt)}</span>
              )}
            </div>
            <div className="draft-strip__actions">
              <button className="text-button" type="button" onClick={startNewWorkout}>
                새 기록 시작
              </button>
              <button className="text-button" type="button" onClick={() => clearDraft({ resetForm: true })}>
                임시저장 비우기
              </button>
            </div>
          </div>

          <div className="form-grid">
            <label>
              날짜
              <input
                type="date"
                value={form.workoutDate}
                onChange={(event) => setForm({ ...form, workoutDate: event.target.value })}
              />
            </label>
            <label>
              루틴 이름
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="예: 하체, 등/이두"
              />
            </label>
          </div>
          <label>
            메모
            <textarea
              value={form.memo}
              onChange={(event) => setForm({ ...form, memo: event.target.value })}
              placeholder="컨디션, 느낌, 다음에 올릴 무게"
              rows="2"
            />
          </label>

          <div className="exercise-list">
            {form.exercises.map((exercise, exerciseIndex) => {
              const categoryMachines = machinesByCategory[exercise.category] || []
              const groupedOptions = groupByEquipment(categoryMachines)
              const selectedMachine = findMachine(machines, exercise)
              const manufacturer = machineManufacturer(selectedMachine)
              return (
                <article className="exercise-card" key={`exercise-${exerciseIndex}`}>
                  <div className="exercise-card__head">
                    <span className="order-badge">{exerciseIndex + 1}</span>
                    <div>
                      <h3>운동 순서 {exerciseIndex + 1}</h3>
                      <p>
                        {exercise.exerciseName || categoryLabel(exercise.category)} ·{' '}
                        {exercise.sets.length}세트
                      </p>
                    </div>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => removeExercise(exerciseIndex)}
                      aria-label="운동 삭제"
                      title="운동 삭제"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <div className="category-pills">
                    {CATEGORIES.map((category) => (
                      <button
                        className={exercise.category === category.id ? 'selected' : ''}
                        key={category.id}
                        type="button"
                        onClick={() => updateExercise(exerciseIndex, 'category', category.id)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>

                  <div className="form-grid">
                    <label>
                      운동
                      <select
                        value={exercise.machineId}
                        onChange={(event) => selectMachine(exerciseIndex, event.target.value)}
                      >
                        <option value="">선택</option>
                        {groupedOptions.map((group) => (
                          <optgroup label={group.type} key={group.type}>
                            {group.items.map((machine) => (
                              <option value={machine.id} key={machine.id}>
                                {machine.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  </div>

                  {manufacturer && (
                    <p className="meta-note">제조사: {manufacturer}</p>
                  )}

                  <div className="sets">
                    {exercise.sets.map((set, setIndex) => (
                      <div className="set-row" key={`set-${exerciseIndex}-${setIndex}`}>
                        <span>{setIndex + 1}세트</span>
                        <label>
                          kg
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={set.weightKg}
                            onChange={(event) =>
                              updateSet(exerciseIndex, setIndex, 'weightKg', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          개
                          <input
                            type="number"
                            min="1"
                            value={set.reps}
                            onChange={(event) =>
                              updateSet(exerciseIndex, setIndex, 'reps', event.target.value)
                            }
                          />
                        </label>
                        <button
                          className="icon-button ghost"
                          type="button"
                          onClick={() => removeSet(exerciseIndex, setIndex)}
                          aria-label="세트 삭제"
                          title="세트 삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button className="soft-button" type="button" onClick={() => addSet(exerciseIndex)}>
                      <Plus size={17} />
                      세트 추가
                    </button>
                  </div>

                  <label>
                    운동 메모
                    <input
                      value={exercise.memo}
                      onChange={(event) => updateExercise(exerciseIndex, 'memo', event.target.value)}
                      placeholder="그립, 의자 높이, 자세 포인트"
                    />
                  </label>
                </article>
              )
            })}
          </div>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={addExercise}>
              <ListPlus size={18} />
              운동 추가
            </button>
            {editingId && (
              <button
                className="secondary-button"
                type="button"
                onClick={startNewWorkout}
              >
                <Plus size={18} />새 기록
              </button>
            )}
          </div>
        </form>
        ) : (
          renderLoginPrompt(
            '로그인하면 오늘 루틴을 바로 기록할 수 있어요.',
            '운동 순서, 세트, 무게, 메모를 회원별로 저장해서 폰에서도 이어서 확인할 수 있습니다.',
          )
        )
      )}

      {activeTab === 'history' && (
        authStatus.authenticated ? (
        <section className="history-page">
          <section className="metric-strip" aria-label="운동 요약">
            <div className="metric">
              <Activity size={20} />
              <span>최근 기록</span>
              <strong>{workouts.length}회</strong>
            </div>
            <div className="metric">
              <Flame size={20} />
              <span>최근 볼륨</span>
              <strong>{formatNumber(weeklyVolume)}kg</strong>
            </div>
            <div className="metric highlight">
              <Dumbbell size={20} />
              <span>마지막 운동</span>
              <strong>{selectedWorkout ? selectedWorkout.title : '대기중'}</strong>
            </div>
          </section>

          {insights && (
            <section className="insight-board" aria-label="운동 인사이트">
              <article className="insight-card insight-card--trend">
                <div className="insight-card__head">
                  <div>
                    <p className="eyebrow">Trend</p>
                    <h2>최근 흐름</h2>
                  </div>
                  {insights.volumeChange >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
                <div className="trend-stat">
                  <strong>{formatSignedNumber(insights.volumeChange, '%')}</strong>
                  <span>최근 {insights.recentCount}회 평균 볼륨</span>
                </div>
                <div className="sparkline">
                  <svg viewBox="0 0 220 58" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points={buildSparklinePoints(insights.volumeSeries)} />
                  </svg>
                </div>
                <p className="insight-note">
                  최근 평균 {formatNumber(insights.averageVolumeRecent)}kg
                  {insights.averageVolumePrevious
                    ? ` / 이전 구간 ${formatNumber(insights.averageVolumePrevious)}kg`
                    : ' / 비교할 이전 기록이 더 쌓이면 더 정확해져요.'}
                </p>
              </article>

              <article className="insight-card">
                <div className="insight-card__head">
                  <div>
                    <p className="eyebrow">Frequency</p>
                    <h2>4주 빈도</h2>
                  </div>
                  <BarChart3 size={18} />
                </div>
                <div className="week-bars" aria-hidden="true">
                  {insights.weeklyBuckets.map((bucket) => {
                    const maxCount = Math.max(...insights.weeklyBuckets.map((item) => item.count), 1)
                    const height = `${Math.max((bucket.count / maxCount) * 100, bucket.count ? 18 : 8)}%`
                    return (
                      <div className="week-bar" key={bucket.label}>
                        <span>{bucket.count}</span>
                        <div>
                          <i style={{ height }} />
                        </div>
                        <small>{bucket.label}</small>
                      </div>
                    )
                  })}
                </div>
                <p className="insight-note">자주 갔던 주와 쉬었던 주가 한눈에 보입니다.</p>
              </article>

              <article className="insight-card">
                <div className="insight-card__head">
                  <div>
                    <p className="eyebrow">Focus</p>
                    <h2>주운동 부위</h2>
                  </div>
                  <PieChart size={18} />
                </div>
                <div className="focus-list">
                  {insights.topCategories.map((item) => (
                    <div className="focus-row" key={item.category}>
                      <div className="focus-row__label">
                        <strong>{categoryLabel(item.category)}</strong>
                        <span>{Math.round((item.count / insights.totalCategorySets) * 100)}%</span>
                      </div>
                      <div className="focus-row__bar">
                        <i style={{ width: `${(item.count / insights.totalCategorySets) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="insight-note">
                  가장 많이 한 부위는 {categoryLabel(insights.mainCategory?.category)}입니다.
                </p>
              </article>

              <article className="insight-card">
                <div className="insight-card__head">
                  <div>
                    <p className="eyebrow">Progress</p>
                    <h2>운동별 변화</h2>
                  </div>
                  <Target size={18} />
                </div>
                <div className="progress-list">
                  <div className="progress-item">
                    <span className="progress-item__badge up">좋아진 운동</span>
                    {insights.topImproved ? (
                      <div>
                        <strong>{insights.topImproved.name}</strong>
                        <p>{formatSignedNumber(insights.topImproved.deltaVolume, 'kg')} 볼륨</p>
                      </div>
                    ) : (
                      <p>비교할 이전 기록이 조금 더 쌓이면 보여드릴게요.</p>
                    )}
                  </div>
                  <div className="progress-item">
                    <span className="progress-item__badge down">쉬어간 운동</span>
                    {insights.topDropped ? (
                      <div>
                        <strong>{insights.topDropped.name}</strong>
                        <p>{formatSignedNumber(insights.topDropped.deltaVolume, 'kg')} 볼륨</p>
                      </div>
                    ) : (
                      <p>최근 기록은 전반적으로 안정적이에요.</p>
                    )}
                  </div>
                </div>
              </article>
            </section>
          )}

          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>기록보기</h2>
            </div>
            {loading && <Loader2 className="spin muted" size={20} />}
          </div>

          <div className="filter-bar">
            <label className="search-field">
              <Search size={17} />
              <input
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder="루틴, 운동, 메모 검색"
              />
            </label>
            <label>
              부위
              <select
                value={filters.category}
                onChange={(event) => setFilters({ ...filters, category: event.target.value })}
              >
                <option value="ALL">전체</option>
                {CATEGORIES.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              시작
              <input
                type="date"
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label>
              종료
              <input
                type="date"
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </label>
          </div>

          <div className="history-grid">
            {filteredWorkouts.map((workout) => (
              <article className="history-card" key={workout.id}>
                <div className="history-card__top">
                  <div>
                    <time>{workout.workoutDate}</time>
                    <h3>{workout.title}</h3>
                  </div>
                  <div className="history-actions">
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => duplicateWorkout(workout)}
                      aria-label="복제"
                      title="복제해서 새 기록"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => editWorkout(workout)}
                      aria-label="수정"
                      title="수정"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => deleteWorkout(workout.id)}
                      aria-label="삭제"
                      title="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="mini-metrics">
                  <span>{workout.totalSets}세트</span>
                  <span>{workout.totalReps}회</span>
                  <span>{formatNumber(workout.totalVolume)}kg</span>
                </div>
                <ol className="exercise-summary">
                  {workout.exercises.map((exercise) => (
                    <li key={exercise.id}>
                      <Check size={15} />
                      <span>
                        <strong>{exercise.exerciseName}</strong>
                        <em>
                          {categoryLabel(exerciseCategory(machines, exercise))}
                          {exerciseManufacturer(machines, exercise)
                            ? ` · ${exerciseManufacturer(machines, exercise)}`
                            : ''}
                        </em>
                        <small>
                          {exercise.sets
                            .map((set) => `${formatNumber(set.weightKg)}kg x ${set.reps}`)
                            .join(' / ')}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
            {!loading && filteredWorkouts.length === 0 && (
              <div className="empty-state">
                <Dumbbell size={30} />
                <p>기록이 없습니다.</p>
              </div>
            )}
          </div>
        </section>
        ) : (
          renderLoginPrompt(
            '로그인하면 지난 운동 기록을 날짜별로 다시 볼 수 있어요.',
            '루틴, 운동 이름, 메모 검색까지 회원 기준으로 정리해서 보여줍니다.',
          )
        )
      )}

      {activeTab === 'gym' && (
        authStatus.authenticated ? (
        <section className="gym-page">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Exercise library</p>
              <h2>나의 운동 목록</h2>
            </div>
          </div>

          <form className="machine-form" onSubmit={saveMachine}>
            <label>
              부위
              <select
                value={machineForm.category}
                onChange={(event) => setMachineForm({ ...machineForm, category: event.target.value })}
              >
                {CATEGORIES.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="machine-name-field">
              운동 이름
              <input
                value={machineForm.name}
                onChange={(event) => setMachineForm({ ...machineForm, name: event.target.value })}
                placeholder="예: 체스트 프레스, 사이드 레터럴 레이즈"
              />
              {machineNameSuggestions.length > 0 && (
                <div className="suggestion-list" role="listbox" aria-label="운동 추천">
                  {machineNameSuggestions.map((suggestion) => (
                    <button
                      className="suggestion-item"
                      type="button"
                      key={`${suggestion.category}-${suggestion.name}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyMachineSuggestion(suggestion)}
                    >
                      <strong>{suggestion.name}</strong>
                      <span>
                        {categoryLabel(suggestion.category)} · {suggestion.equipmentType}
                        {suggestion.manufacturer ? ` · ${suggestion.manufacturer}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label>
              운동 방식
              <select
                value={machineForm.equipmentType}
                onChange={(event) => {
                  const nextType = event.target.value
                  setMachineForm({
                    ...machineForm,
                    equipmentType: nextType,
                    manufacturer: nextType === '머신' ? machineForm.manufacturer : '',
                    customManufacturer: nextType === '머신' ? machineForm.customManufacturer : '',
                  })
                }}
              >
                {EQUIPMENT_TYPES.map((type) => (
                  <option value={type} key={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              제조사
              <select
                value={machineForm.equipmentType === '머신' ? machineForm.manufacturer : ''}
                disabled={machineForm.equipmentType !== '머신'}
                onChange={(event) =>
                  setMachineForm({
                    ...machineForm,
                    manufacturer: event.target.value,
                    customManufacturer:
                      event.target.value === '기타' ? machineForm.customManufacturer : '',
                  })
                }
              >
                <option value="">
                  {machineForm.equipmentType === '머신' ? '선택 안 함' : '머신 전용'}
                </option>
                {MANUFACTURER_OPTIONS.map((manufacturer) => (
                  <option value={manufacturer} key={manufacturer}>
                    {manufacturer}
                  </option>
                ))}
              </select>
            </label>
            {machineForm.equipmentType === '머신' && machineForm.manufacturer === '기타' && (
              <label className="machine-form__wide">
                직접 입력
                <input
                  value={machineForm.customManufacturer}
                  onChange={(event) =>
                    setMachineForm({ ...machineForm, customManufacturer: event.target.value })
                  }
                  placeholder="예: 국내 제조사명"
                />
              </label>
            )}
            <button className="icon-button primary" type="submit" aria-label="운동 추가" title="운동 추가">
              <Plus size={19} />
            </button>
          </form>

          <div className="machine-groups">
            {CATEGORIES.map((category) => (
              <article className="machine-group" key={category.id}>
                <div className="machine-group__head">
                  <h3>{category.label}</h3>
                  <span>{(machinesByCategory[category.id] || []).length}개</span>
                </div>
                <div className="machine-list">
                  {(machinesByCategory[category.id] || []).map((machine) => (
                    <div className="machine-row" key={machine.id}>
                      <div>
                        <strong>{machine.name}</strong>
                        <em>{machineMeta(machine)} · {machine.defaultMachine ? '기본 운동' : '내 운동'}</em>
                      </div>
                      <button
                        className="icon-button ghost"
                        type="button"
                        onClick={() => deleteMachine(machine.id)}
                        aria-label="운동 삭제"
                        title="운동 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
        ) : (
          renderLoginPrompt(
            '로그인하면 헬스장 운동 목록을 내 방식대로 관리할 수 있어요.',
            '부위별 운동 추가, 추천 검색, 머신 제조사 관리까지 회원 계정에 맞춰 따로 저장됩니다.',
          )
        )
      )}
    </main>
  )
}

export default App
