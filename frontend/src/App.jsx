import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
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
  X,
} from 'lucide-react'
import './App.css'
import WorkoutSidebar from './components/WorkoutSidebar.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { subscribeAuth, signIn, signOut } from './lib/firebaseClient.js'
import {
  listWorkouts,
  saveWorkout as persistWorkout,
  deleteWorkout as removeWorkout,
  listMachines,
  saveMachine as persistMachine,
  deleteMachine as removeMachine,
} from './lib/firebaseRepository.js'

const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const todayTimestamp = new Date(`${today}T00:00:00`).getTime()
const displayDate = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

const PAGES = {
  log: { title: '오늘의 운동', description: '한 세트씩, 나의 페이스로 기록하세요.' },
  history: { title: '쌓여가는 기록', description: '지난 운동을 돌아보고 다음 루틴을 준비하세요.' },
  gym: { title: '나의 운동 목록', description: '자주 쓰는 기구와 운동을 한곳에 정리하세요.' },
}

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

function machineManufacturer(machine) {
  return machine?.manufacturer?.trim() || ''
}

function exerciseManufacturer(machines, exercise) {
  return exercise.manufacturer || machineManufacturer(findMachine(machines, exercise))
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

function toPayload(form, machines) {
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
  const [loginPending, setLoginPending] = useState(false)
  const [machineSaving, setMachineSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [machineQuery, setMachineQuery] = useState('')
  const [showInsights, setShowInsights] = useState(() => window.matchMedia('(min-width: 601px)').matches)
  const [draftMeta, setDraftMeta] = useState({ ready: false, restored: false, savedAt: '' })
  const draftUserRef = useRef(null)
  const exerciseListRef = useRef(null)
  const focusNewExerciseRef = useRef(false)
  const feedbackRef = useRef(null)

  const hasFilters = Boolean(filters.query || filters.category !== 'ALL' || filters.from || filters.to)

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
      return 0
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
        const date = new Date(`${workout.workoutDate}T00:00:00`)
        return date >= start && date <= end
      }).length
      return {
        label: index === 0 ? '이번주' : `${index}주 전`,
        count,
      }
    }).reverse()

    const recentCategorySource = sorted.filter((workout) => {
      const diff = Math.floor((todayTimestamp - new Date(`${workout.workoutDate}T00:00:00`).getTime()) / 86400000)
      return diff >= 0 && diff <= 30
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

    const totalCategorySets = [...categoryTotals.values()].reduce((sum, count) => sum + count, 0) || 1
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

  const visibleMachineGroups = useMemo(() => CATEGORIES.map((category) => ({
    ...category,
    items: (machinesByCategory[category.id] || []).filter((machine) =>
      normalizeSearch(`${machine.name} ${machineMeta(machine)} ${category.label}`)
        .includes(normalizeSearch(machineQuery)),
    ),
  })).filter((category) => !machineQuery.trim() || category.items.length > 0), [machinesByCategory, machineQuery])

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
    setWorkouts(await listWorkouts())
  }

  async function loadMachines() {
    setMachines(await listMachines())
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
    let active = true
    let version = 0
    const unsubscribe = subscribeAuth(async (status) => {
      const currentVersion = ++version
      if (!active) return
      setAuthStatus({ checked: true, ...status })
      setWorkouts([])
      setMachines([])
      setForm(blankWorkout())
      setEditingId(null)
      setError('')
      setNotice('')
      setConfirmation(null)
      setLoading(status.authenticated)
      if (!status.authenticated) return

      try {
        const [nextWorkouts, nextMachines] = await Promise.all([listWorkouts(), listMachines()])
        if (!active || currentVersion !== version) return
        setWorkouts(nextWorkouts)
        setMachines(nextMachines)
      } catch (err) {
        if (active && currentVersion === version) setError(err.message)
      } finally {
        if (active && currentVersion === version) setLoading(false)
      }
    }, (err) => {
      if (!active) return
      setError(err.message)
      setAuthStatus({ checked: true, authenticated: false, user: null, googleLoginEnabled: false })
      setLoading(false)
    })

    return () => {
      active = false
      version += 1
      unsubscribe()
    }
  }, [])

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
          return { ...exercise, category: value, machineId: '', exerciseName: '', equipment: '', manufacturer: '' }
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
              manufacturer: machine.manufacturer || '',
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
    focusNewExerciseRef.current = true
    setForm((current) => ({ ...current, exercises: [...current.exercises, blankExercise()] }))
  }

  useEffect(() => {
    if (!focusNewExerciseRef.current) return
    focusNewExerciseRef.current = false
    const card = exerciseListRef.current?.lastElementChild
    card?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    card?.querySelector('select')?.focus({ preventScroll: true })
  }, [form.exercises.length])

  useEffect(() => {
    if (error) {
      feedbackRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
      feedbackRef.current?.focus({ preventScroll: true })
    }
  }, [error])

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
        index === exerciseIndex ? { ...exercise, sets: [...exercise.sets, { ...exercise.sets.at(-1) }] } : exercise,
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
    const payload = toPayload(form, machines)
    if (payload.exercises.length === 0) {
      setError('부위와 운동을 하나 이상 선택해주세요.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      await persistWorkout(payload, editingId)
      clearDraft()
      setForm(blankWorkout())
      setEditingId(null)
      setActiveTab('history')
      setFilters({ query: '', category: 'ALL', from: '', to: '' })
      await loadWorkouts()
      setNotice(editingId ? '운동 기록을 수정했어요.' : '운동 기록을 저장했어요.')
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteWorkout(id) {
    setError('')
    setNotice('')
    try {
      await removeWorkout(id)
      if (editingId === id) {
        clearDraft()
        setEditingId(null)
        setForm(blankWorkout())
      }
      await loadWorkouts()
      setNotice('운동 기록을 삭제했어요.')
    } catch (err) {
      setError(err.message)
    }
  }

  function editWorkout(workout) {
    confirmDraftReplacement(() => {
      setEditingId(workout.id)
      setForm(fromWorkout(workout, machines))
      setDraftMeta((current) => ({ ...current, restored: false }))
      setActiveTab('log')
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      setNotice('기록을 수정한 뒤 하단의 수정 저장을 눌러주세요.')
    })
  }

  function duplicateWorkout(workout) {
    confirmDraftReplacement(() => {
      setEditingId(null)
      setForm({
        ...fromWorkout(workout, machines),
        workoutDate: today,
      })
      setDraftMeta((current) => ({ ...current, restored: false }))
      setActiveTab('log')
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      setNotice('오늘 날짜로 루틴을 불러왔어요. 무게와 횟수를 조절해보세요.')
    })
  }

  function confirmDraftReplacement(onConfirm) {
    if (hasDraftContent(form, editingId)) {
      setConfirmation({
        title: '작성 중인 루틴을 바꿀까요?',
        description: '아직 저장하지 않은 내용은 사라져요. 현재 루틴을 저장하려면 취소를 눌러주세요.',
        label: '바꾸기',
        onConfirm,
      })
      return
    }
    onConfirm()
  }

  function startNewWorkout() {
    confirmDraftReplacement(() => {
      clearDraft({ resetForm: true })
      setNotice('')
      setError('')
    })
  }

  async function saveMachine(event) {
    event.preventDefault()
    if (!machineForm.name.trim()) {
      setError('운동 이름을 입력해주세요.')
      return
    }
    setError('')
    setMachineSaving(true)
    setNotice('')
    try {
      await persistMachine({
        category: machineForm.category,
        name: machineForm.name,
        equipmentType: machineForm.equipmentType,
        manufacturer: normalizedManufacturer(machineForm),
      })
      setMachineForm(blankMachine())
      await loadMachines()
      setNotice('운동 목록에 추가했어요.')
    } catch (err) {
      setError(err.message)
    } finally {
      setMachineSaving(false)
    }
  }

  async function deleteMachine(id) {
    setError('')
    setNotice('')
    try {
      await removeMachine(id)
      await loadMachines()
      setNotice('운동 목록에서 삭제했어요. 이전 운동 기록은 유지됩니다.')
    } catch (err) {
      setError(err.message)
    }
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

  async function login() {
    setLoginPending(true)
    setError('')
    try {
      await signIn()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoginPending(false)
    }
  }

  async function logout() {
    try {
      persistDraft(form, editingId)
      await signOut()
    } catch (err) {
      setError(err.message)
    }
  }

  function renderLoginPrompt(title, description) {
    return (
      <section className="locked-panel">
        <div className="locked-panel__content">
          <span className="welcome-mark" aria-hidden="true"><Dumbbell size={25} strokeWidth={1.5} /></span>
          <h2>{title}</h2>
          <p>{description}</p>
          {authStatus.googleLoginEnabled ? (
            <button className="primary-button auth-button" type="button" onClick={login} disabled={loginPending}>
              {loginPending ? <Loader2 className="spin" size={17} /> : <LogIn size={17} />}
              Google로 시작하기
            </button>
          ) : (
            <p className="setup-note">로그인 연결을 준비하고 있습니다.</p>
          )}
          <small className="welcome-footnote">나의 기록과 운동 목록을 계정에 안전하게 보관합니다.</small>
        </div>
        <div className="welcome-guide">
          <p className="eyebrow">기록에 필요한 것만</p>
          {[
            ['01', '오늘의 루틴', '운동 부위와 기구를 선택하세요.'],
            ['02', '한 세트의 기록', '무게와 횟수, 기억할 메모를 남기세요.'],
            ['03', '쌓여가는 변화', '지난 루틴을 돌아보고 이어가세요.'],
          ].map(([number, label, detail]) => (
            <div className="welcome-step" key={number}>
              <span>{number}</span>
              <div><h3>{label}</h3><p>{detail}</p></div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (loading && !authStatus.checked) {
    return (
      <main className="app-shell auth-shell" aria-busy="true">
        <div className="loading-state">
          <span className="brand-mark"><Dumbbell size={20} /></span>
          <h1>HelloG</h1>
          <p><Loader2 className="spin" size={16} /> 운동 기록을 준비하고 있습니다.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setActiveTab('log')} aria-label="HelloG 기록하기 홈">
          <span className="brand-mark"><Dumbbell size={19} strokeWidth={1.8} /></span>
          <span>HelloG<span className="brand-dot">.</span></span>
        </button>
        <div className="topbar-actions">
          <time className="today-pill" dateTime={today}><CalendarDays size={15} />{displayDate}</time>
          {authStatus.authenticated ? (
            <div className="user-pill">
              {authStatus.user?.pictureUrl ? <img alt="" src={authStatus.user.pictureUrl} referrerPolicy="no-referrer" /> : <span>{authStatus.user?.name?.slice(0, 1) || 'G'}</span>}
              <strong>{authStatus.user?.name || '회원'}</strong>
              <button type="button" onClick={logout} title="로그아웃" aria-label="로그아웃"><LogOut size={16} /></button>
            </div>
          ) : authStatus.googleLoginEnabled ? (
            <button className="topbar-login" type="button" onClick={login} disabled={loginPending}>
              {loginPending ? <Loader2 className="spin" size={15} /> : <LogIn size={15} />} 로그인
            </button>
          ) : null}
        </div>
      </header>

      <nav className="app-tabs" aria-label="화면 전환">
        {[
          ['log', Dumbbell, '기록하기'],
          ['history', History, '기록보기'],
          ['gym', Layers3, '운동 목록'],
        ].map(([tab, Icon, label]) => (
          <button key={tab} className={activeTab === tab ? 'active' : ''} type="button" aria-current={activeTab === tab ? 'page' : undefined} onClick={() => setActiveTab(tab)}>
            <Icon size={17} strokeWidth={1.7} />{label}
          </button>
        ))}
      </nav>

      <div className="page-heading">
        <div><h1>{PAGES[activeTab].title}</h1><p>{PAGES[activeTab].description}</p></div>
      </div>

      {error && <p ref={feedbackRef} className="alert" role="alert" tabIndex={-1}>{error}</p>}
      {notice && (
        <div className="notice" role="status">
          <Check size={18} aria-hidden="true" /><p>{notice}</p>
          <button className="icon-button" type="button" aria-label="안내 닫기" onClick={() => setNotice('')}><X size={18} /></button>
        </div>
      )}
      <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      {loading && authStatus.authenticated && <div className="data-loading" role="status"><Loader2 className="spin" size={16} /> 기록을 불러오고 있습니다.</div>}

      {activeTab === 'log' && (
        authStatus.authenticated ? (
        <div className="workspace-grid">
        <form className="planner" onSubmit={saveWorkout}>
          <div className="section-heading">
            <div>
              <h2>{editingId ? '기록 수정' : '루틴 작성'}</h2>
              <p className="section-description">날짜와 운동을 선택해 시작하세요.</p>
            </div>
            <button className="text-button" type="button" onClick={startNewWorkout}><Plus size={15} /> 새로 작성</button>
          </div>

          <div className="session-details">
          <div className="draft-strip" role="status">
            <div className="draft-strip__items">
              <span className="draft-indicator" />
              {!draftMeta.savedAt && !draftMeta.restored && <span className="draft-pill">작성 내용 자동 임시 저장</span>}
              {editingId && <span className="draft-pill accent">이전 기록 수정 중</span>}
              {draftMeta.restored && <span className="draft-pill">임시 저장 복구됨</span>}
              {draftMeta.savedAt && (
                <span className="draft-pill">임시 저장 {formatDraftTime(draftMeta.savedAt)}</span>
              )}
            </div>
            <div className="draft-strip__actions">
              {draftMeta.savedAt && <button className="text-button muted" type="button" onClick={startNewWorkout}>비우기</button>}
            </div>
          </div>

          {selectedWorkout && (
            <div className="routine-shortcut">
              <div><span>최근 루틴</span><strong>{selectedWorkout.title}</strong></div>
              <button className="text-button" type="button" onClick={() => duplicateWorkout(selectedWorkout)}><Copy size={16} /> 불러오기</button>
            </div>
          )}

          <div className="form-grid">
            <label>
              날짜
              <input
                type="date"
                required
                value={form.workoutDate}
                onChange={(event) => setForm({ ...form, workoutDate: event.target.value })}
              />
            </label>
            <label>
              루틴 이름
              <input
                value={form.title}
                maxLength={100}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="예: 하체, 등/이두"
              />
            </label>
          </div>
          <details className="routine-note">
            <summary>루틴 메모 <span>선택</span></summary>
          <label>
            메모
            <textarea
              value={form.memo}
              onChange={(event) => setForm({ ...form, memo: event.target.value })}
              placeholder="컨디션, 느낌, 다음에 올릴 무게"
              rows="2"
              maxLength={2000}
            />
          </label>
          </details>
          </div>

          <div className="exercise-list" ref={exerciseListRef}>
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
                      <h3>{exercise.exerciseName || '운동 선택'}</h3>
                      <p>
                        {categoryLabel(exercise.category)} ·{' '}
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
                        aria-pressed={exercise.category === category.id}
                        onClick={() => updateExercise(exerciseIndex, 'category', category.id)}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>

                  <div className="exercise-select">
                    <label>
                      운동
                      <select
                        value={exercise.machineId}
                        required={!exercise.exerciseName}
                        onChange={(event) => selectMachine(exerciseIndex, event.target.value)}
                      >
                        <option value="">{!selectedMachine && exercise.exerciseName ? `${exercise.exerciseName} (이전 기록의 운동)` : `${categoryLabel(exercise.category)} 운동을 선택하세요`}</option>
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
                    <div className="sets-heading" aria-hidden="true"><span>세트</span><span>무게 <small>kg</small></span><span>횟수</span><span /></div>
                    {exercise.sets.map((set, setIndex) => (
                      <div className="set-row" key={`set-${exerciseIndex}-${setIndex}`}>
                        <span>{String(setIndex + 1).padStart(2, '0')}</span>
                        <label>
                          <span className="sr-only">운동 {exerciseIndex + 1}, {setIndex + 1}세트 무게 (kg)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            required
                            inputMode="decimal"
                            value={set.weightKg}
                            onChange={(event) =>
                              updateSet(exerciseIndex, setIndex, 'weightKg', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span className="sr-only">운동 {exerciseIndex + 1}, {setIndex + 1}세트 횟수</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            inputMode="numeric"
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
                    <button className="soft-button" type="button" title="마지막 세트의 무게와 횟수를 이어받습니다" onClick={() => addSet(exerciseIndex)}>
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
            <button className="primary-button" type="submit" disabled={saving || loading}>
              {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
              {saving ? '저장 중' : editingId ? '수정 저장' : '기록 저장'}
            </button>
          </div>
        </form>
        <WorkoutSidebar form={form} recentWorkout={selectedWorkout} onDuplicate={duplicateWorkout} />
        </div>
        ) : (
          renderLoginPrompt(
            '매일의 운동을,\n나만의 기록으로.',
            '오늘 들었던 무게, 마지막 한 번까지. 간결하게 기록하고 다음 운동에 이어가세요.',
          )
        )
      )}

      {activeTab === 'history' && (
        authStatus.authenticated ? (
        <section className="history-page">
          <section className="metric-strip" aria-label="운동 요약">
            <div className="metric">
              <Activity size={20} />
              <span>전체 운동 기록</span>
              <strong>{workouts.length}회</strong>
            </div>
            <div className="metric">
              <Flame size={20} />
              <span>최근 7회 볼륨</span>
              <strong>{formatNumber(weeklyVolume)}kg</strong>
            </div>
            <div className="metric highlight">
              <Dumbbell size={20} />
              <span>마지막 운동</span>
              <strong>{selectedWorkout ? selectedWorkout.title : '대기중'}</strong>
            </div>
          </section>

          {insights && (
            <section className="insight-overview">
              <button className="insight-toggle" type="button" aria-expanded={showInsights} aria-controls="workout-insights" onClick={() => setShowInsights(!showInsights)}>
                <span><BarChart3 size={20} /><strong>운동 변화 살펴보기</strong></span>
                <ChevronDown size={20} />
              </button>
            <section id="workout-insights" className="insight-board" aria-label="운동 인사이트" hidden={!showInsights}>
              <article className="insight-card insight-card--trend">
                <div className="insight-card__head">
                  <div>
                    <h2>최근 흐름</h2>
                  </div>
                  {insights.volumeChange >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
                <div className="trend-stat">
                  <strong>{insights.averageVolumePrevious ? formatSignedNumber(insights.volumeChange, '%') : '—'}</strong>
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
                <p className="sr-only">{insights.weeklyBuckets.map((bucket) => `${bucket.label} ${bucket.count}회`).join(', ')}</p>
                <p className="insight-note">자주 갔던 주와 쉬었던 주가 한눈에 보입니다.</p>
              </article>

              <article className="insight-card">
                <div className="insight-card__head">
                  <div>
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
            </section>
          )}

          <div className="section-heading">
            <div>
              <h2>운동 내역 <span className="count-label">{filteredWorkouts.length}</span></h2>
            </div>
            <div className="section-heading__actions">
              {hasFilters && <button className="text-button" type="button" onClick={() => setFilters({ query: '', category: 'ALL', from: '', to: '' })}>필터 초기화</button>}
              {loading && <Loader2 className="spin muted" size={20} />}
            </div>
          </div>

          <div className="filter-bar">
            <div className="search-field">
              <Search size={17} />
              <input
                aria-label="기록 검색"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                placeholder="루틴, 운동, 메모 검색"
              />
              {filters.query && <button className="search-clear icon-button" type="button" aria-label="검색어 지우기" onClick={(event) => { setFilters({ ...filters, query: '' }); event.currentTarget.parentElement.querySelector('input').focus() }}><X size={16} /></button>}
            </div>
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
                max={filters.to || undefined}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label>
              종료
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
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
                      className="record-action"
                      type="button"
                      onClick={() => duplicateWorkout(workout)}
                      title="복제해서 새 기록"
                    >
                      <Copy size={16} /><span>불러오기</span>
                    </button>
                    <button
                      className="record-action"
                      type="button"
                      onClick={() => editWorkout(workout)}
                      aria-label="수정"
                      title="수정"
                    >
                      <Pencil size={16} /><span>수정</span>
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => setConfirmation({ title: '이 기록을 삭제할까요?', description: `${workout.workoutDate} · ${workout.title}. 삭제한 기록은 되돌릴 수 없어요.`, label: '삭제하기', danger: true, onConfirm: () => deleteWorkout(workout.id) })}
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
                <h3>{workouts.length ? '검색 결과가 없습니다.' : '아직 운동 기록이 없습니다.'}</h3>
                <p>{workouts.length ? '검색어나 날짜 범위를 바꿔보세요.' : '첫 루틴을 기록하고 나만의 흐름을 만들어보세요.'}</p>
                {!workouts.length && <button className="secondary-button" type="button" onClick={() => setActiveTab('log')}><Plus size={16} /> 첫 운동 기록하기</button>}
                {workouts.length > 0 && <button className="secondary-button" type="button" onClick={() => setFilters({ query: '', category: 'ALL', from: '', to: '' })}>전체 기록 보기</button>}
              </div>
            )}
          </div>
        </section>
        ) : (
          renderLoginPrompt(
            '지난 운동이,\n다음 운동의 기준이 되도록.',
            '날짜와 부위별 기록을 살펴보고, 익숙한 루틴을 다시 시작하세요.',
          )
        )
      )}

      {activeTab === 'gym' && (
        authStatus.authenticated ? (
        <section className="gym-page">
          <div className="section-heading">
            <div>
              <h2>운동 추가</h2>
              <p className="section-description">목록에 없는 운동을 직접 등록하세요.</p>
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
                maxLength={100}
                required
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
            <button className="primary-button" type="submit" disabled={machineSaving || loading}>
              {machineSaving ? <Loader2 className="spin" size={17} /> : <Plus size={17} />} 운동 추가
            </button>
          </form>

          <div className="section-heading catalog-heading">
            <h2>등록한 운동 <span className="count-label">{machines.length}</span></h2>
            <div className="search-field">
              <Search size={18} />
              <input aria-label="운동 목록 검색" value={machineQuery} onChange={(event) => setMachineQuery(event.target.value)} placeholder="운동, 부위, 제조사 검색" />
              {machineQuery && <button className="search-clear icon-button" type="button" aria-label="운동 검색어 지우기" onClick={(event) => { setMachineQuery(''); event.currentTarget.parentElement.querySelector('input').focus() }}><X size={16} /></button>}
            </div>
          </div>
          <div className="machine-groups">
            {visibleMachineGroups.map((category) => (
              <article className="machine-group" key={category.id}>
                <div className="machine-group__head">
                  <h3>{category.label}</h3>
                  <span>{category.items.length}개</span>
                </div>
                <div className="machine-list">
                  {category.items.length === 0 && <p className="machine-empty">등록된 운동이 없습니다.</p>}
                  {category.items.map((machine) => (
                    <div className="machine-row" key={machine.id}>
                      <div>
                        <strong>{machine.name}</strong>
                        <em>{machineMeta(machine)} · {machine.defaultMachine ? '기본 운동' : '내 운동'}</em>
                      </div>
                      <button
                        className="icon-button ghost"
                        type="button"
                        onClick={() => setConfirmation({ title: '목록에서 삭제할까요?', description: `${machine.name}을 목록에서 삭제해요. 이전 운동 기록은 그대로 남습니다.`, label: '삭제하기', danger: true, onConfirm: () => deleteMachine(machine.id) })}
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
            {!visibleMachineGroups.length && <div className="empty-state"><Search size={28} /><h3>찾는 운동이 없어요.</h3><p>검색어를 바꾸거나 위에서 새 운동을 등록해보세요.</p><button className="secondary-button" type="button" onClick={() => setMachineQuery('')}>전체 운동 보기</button></div>}
          </div>
        </section>
        ) : (
          renderLoginPrompt(
            '내가 하는 운동,\n내 방식대로 정리하세요.',
            '기본 운동부터 헬스장의 기구까지. 필요한 운동을 내 목록에 담으세요.',
          )
        )
      )}
    </main>
  )
}

export default App
