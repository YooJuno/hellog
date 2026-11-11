import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
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
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import WorkoutSidebar from './components/WorkoutSidebar.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import ExerciseCard from './components/ExerciseCard.jsx'
import InsightsBoundary from './components/InsightsBoundary.jsx'
import {
  CATEGORIES, EQUIPMENT_TYPES, MANUFACTURER_OPTIONS, categoryLabel, formatNumber,
  normalizeSearch, machineMeta, exerciseManufacturer, exerciseCategory, toPayload,
  fromWorkout, mergeWorkout, compareMachines, workoutSearchText,
} from './lib/workoutUtils.js'

import { subscribeAuth, signIn, signOut } from './lib/firebaseClient.js'
import {
  listWorkouts,
  saveWorkout as persistWorkout,
  deleteWorkout as removeWorkout,
  listMachines,
  saveMachine as persistMachine,
  deleteMachine as removeMachine,
} from './lib/workoutService.js'

const WorkoutInsights = lazy(() => import('./components/WorkoutInsights.jsx'))

const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const todayTimestamp = new Date(`${today}T00:00:00`).getTime()
const displayDate = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

const PAGES = {
  log: { title: '오늘의 운동', description: '한 세트씩, 나의 페이스로 기록하세요.' },
  history: { title: '쌓여가는 기록', description: '지난 운동을 돌아보고 다음 루틴을 준비하세요.' },
  gym: { title: '나의 운동 목록', description: '자주 쓰는 기구와 운동을 한곳에 정리하세요.' },
}

const blankSet = () => ({ weightKg: 20, reps: 10 })
const blankExercise = () => ({
  uiId: crypto.randomUUID(),
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
const HISTORY_PAGE_SIZE = 12

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

function normalizedManufacturer(machineForm) {
  if (machineForm.equipmentType !== '머신') return null
  if (machineForm.manufacturer === '기타') {
    return machineForm.customManufacturer.trim() || null
  }
  return machineForm.manufacturer || null
}

function revealInvalidField(event) {
  let parent = event.target.parentElement
  while (parent) {
    if (parent.tagName === 'DETAILS') parent.open = true
    parent = parent.parentElement
  }
}

function App() {
  const [authStatus, setAuthStatus] = useState({ checked: false, authenticated: false, user: null, googleLoginEnabled: true })
  const [activeTab, setActiveTab] = useState('log')
  const [workouts, setWorkouts] = useState([])
  const [machines, setMachines] = useState([])
  const [form, setForm] = useState(blankWorkout)
  const [machineForm, setMachineForm] = useState(blankMachine)
  const [filters, setFiltersState] = useState({ query: '', category: 'ALL', from: '', to: '' })
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
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
  const [showDateFilters, setShowDateFilters] = useState(() => window.matchMedia('(min-width: 801px)').matches)
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(() => window.matchMedia('(min-width: 801px)').matches)
  const [draftMeta, setDraftMeta] = useState({ ready: false, restored: false, savedAt: '' })
  const draftUserRef = useRef(null)
  const exerciseListRef = useRef(null)
  const focusNewExerciseRef = useRef(false)
  const feedbackRef = useRef(null)
  const authSessionRef = useRef(0)
  const latestDraftRef = useRef({ form, editingId })
  const userId = authStatus.user?.id

  useEffect(() => {
    latestDraftRef.current = { form, editingId }
  }, [form, editingId])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeTab])

  const setFilters = useCallback((next) => {
    setFiltersState(next)
    setHistoryLimit(HISTORY_PAGE_SIZE)
  }, [])

  const hasFilters = Boolean(filters.query || filters.category !== 'ALL' || filters.from || filters.to)

  const selectedWorkout = workouts[0]
  const weeklyVolume = useMemo(
    () => workouts.slice(0, 7).reduce((sum, workout) => sum + Number(workout.totalVolume || 0), 0),
    [workouts],
  )

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

  const workoutSearchIndex = useMemo(() => workouts.map((workout) => ({
    workout,
    text: workoutSearchText(workout, machines),
    categories: new Set(workout.exercises.map((exercise) => exerciseCategory(machines, exercise))),
  })), [workouts, machines])

  const filteredWorkouts = useMemo(() => {
    const query = normalizeSearch(filters.query)
    return workoutSearchIndex.filter(({ workout, text, categories }) => {
      const dateMatch =
        (!filters.from || workout.workoutDate >= filters.from) &&
        (!filters.to || workout.workoutDate <= filters.to)
      if (!dateMatch) return false

      const categoryMatch =
        filters.category === 'ALL' ||
        categories.has(filters.category)
      if (!categoryMatch) return false

      return !query || text.includes(query)
    }).map(({ workout }) => workout)
  }, [filters, workoutSearchIndex])

  const persistDraft = useCallback((nextForm, nextEditingId) => {
    if (!authStatus.authenticated || !userId) return null

    try {
      const key = draftStorageKey(userId)
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
  }, [authStatus.authenticated, userId])

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
      authSessionRef.current += 1
      setAuthStatus({ checked: true, ...status })
      setWorkouts([])
      setMachines([])
      setForm(blankWorkout())
      setEditingId(null)
      setError('')
      setNotice('')
      setConfirmation(null)
      setSaving(false)
      setMachineSaving(false)
      setFilters({ query: '', category: 'ALL', from: '', to: '' })
      setMachineQuery('')
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
      authSessionRef.current += 1
      unsubscribe()
    }
  }, [setFilters])

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
      if (typeof snapshot?.form?.title === 'string' && typeof snapshot.form.workoutDate === 'string'
        && Array.isArray(snapshot.form.exercises) && snapshot.form.exercises.length > 0 && snapshot.form.exercises.length <= 30
        && snapshot.form.exercises.every((exercise) => typeof exercise?.exerciseName === 'string'
          && CATEGORIES.some((category) => category.id === exercise.category)
          && Array.isArray(exercise.sets) && exercise.sets.length > 0
          && exercise.sets.every((set) => set && ['number', 'string'].includes(typeof set.weightKg) && ['number', 'string'].includes(typeof set.reps)))) {
        queueMicrotask(() => {
          setForm({ ...blankWorkout(), ...snapshot.form, exercises: snapshot.form.exercises.map((exercise) => ({ ...blankExercise(), ...exercise, uiId: crypto.randomUUID() })) })
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
      const latest = latestDraftRef.current
      persistDraft(latest.form, latest.editingId)
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
  }, [authStatus.authenticated, authStatus.user?.id, draftMeta.ready, persistDraft])

  const updateExercise = useCallback((index, field, value) => {
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
  }, [])

  const selectMachine = useCallback((exerciseIndex, machineId) => {
    const machine = machines.find((item) => String(item.id) === String(machineId))
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index !== exerciseIndex ? exercise : machine
          ? {
              ...exercise,
              category: machine.category,
              machineId: String(machine.id),
              exerciseName: machine.name,
              equipment: machine.equipmentType,
              manufacturer: machine.manufacturer || '',
            }
          : { ...exercise, machineId: '', exerciseName: '', equipment: '', manufacturer: '' },
      ),
    }))
  }, [machines])

  const updateSet = useCallback((exerciseIndex, setIndex, field, value) => {
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
  }, [])

  function addExercise() {
    if (form.exercises.length >= 30) return
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

  const removeExercise = useCallback((index) => {
    setForm((current) => ({
      ...current,
      exercises:
        current.exercises.length === 1
          ? [blankExercise()]
          : current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index),
    }))
  }, [])

  const requestRemoveExercise = useCallback((index, exercise) => {
    if (!exercise.exerciseName) return removeExercise(index)
    setConfirmation({
      title: '이 운동을 빼고 기록할까요?',
      description: `${exercise.exerciseName}의 ${exercise.sets.length}개 세트와 메모가 작성 중인 루틴에서 삭제돼요.`,
      label: '빼기',
      danger: true,
      onConfirm: () => removeExercise(index),
    })
  }, [removeExercise])

  const addSet = useCallback((exerciseIndex) => {
    setForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex ? { ...exercise, sets: [...exercise.sets, { ...exercise.sets.at(-1) }] } : exercise,
      ),
    }))
  }, [])

  const removeSet = useCallback((exerciseIndex, setIndex) => {
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
  }, [])

  async function saveWorkout(event) {
    event.preventDefault()
    if (saving) return
    const session = authSessionRef.current
    const payload = toPayload(form, machines)
    if (payload.exercises.length === 0) {
      setError('부위와 운동을 하나 이상 선택해주세요.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await persistWorkout(payload, editingId)
      if (session !== authSessionRef.current) return
      setWorkouts((current) => mergeWorkout(current, saved))
      clearDraft()
      setForm(blankWorkout())
      setEditingId(null)
      setActiveTab('history')
      setFilters({ query: '', category: 'ALL', from: '', to: '' })
      setNotice(editingId ? '운동 기록을 수정했어요.' : '운동 기록을 저장했어요.')
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (err) {
      if (session === authSessionRef.current) setError(err.message)
    } finally {
      if (session === authSessionRef.current) setSaving(false)
    }
  }

  async function deleteWorkout(id) {
    const session = authSessionRef.current
    setError('')
    setNotice('')
    try {
      await removeWorkout(id)
      if (session !== authSessionRef.current) return
      setWorkouts((current) => current.filter((workout) => workout.id !== id))
      if (latestDraftRef.current.editingId === id) {
        clearDraft()
        setEditingId(null)
        setForm(blankWorkout())
      }
      setNotice('운동 기록을 삭제했어요.')
    } catch (err) {
      if (session === authSessionRef.current) setError(err.message)
    }
  }

  function editWorkout(workout) {
    if (saving || loading) return
    confirmDraftReplacement(() => {
      setEditingId(workout.id)
      setForm(fromWorkout(workout, machines))
      setSessionDetailsOpen(true)
      setDraftMeta((current) => ({ ...current, restored: false }))
      setActiveTab('log')
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      setNotice('기록을 수정한 뒤 하단의 수정 저장을 눌러주세요.')
    })
  }

  function duplicateWorkout(workout) {
    if (saving || loading) return
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
    if (machineSaving) return
    const session = authSessionRef.current
    if (!machineForm.name.trim()) {
      setError('운동 이름을 입력해주세요.')
      return
    }
    setError('')
    setMachineSaving(true)
    setNotice('')
    try {
      const saved = await persistMachine({
        category: machineForm.category,
        name: machineForm.name,
        equipmentType: machineForm.equipmentType,
        manufacturer: normalizedManufacturer(machineForm),
      })
      if (session !== authSessionRef.current) return
      setMachines((current) => [...current.filter((machine) => machine.id !== saved.id), saved].sort(compareMachines))
      setMachineForm(blankMachine())
      setMachineQuery('')
      setNotice('운동 목록에 추가했어요.')
    } catch (err) {
      if (session === authSessionRef.current) setError(err.message)
    } finally {
      if (session === authSessionRef.current) setMachineSaving(false)
    }
  }

  async function deleteMachine(id) {
    const session = authSessionRef.current
    setError('')
    setNotice('')
    try {
      await removeMachine(id)
      if (session !== authSessionRef.current) return
      setMachines((current) => current.filter((machine) => machine.id !== id))
      setNotice('운동 목록에서 삭제했어요. 이전 운동 기록은 유지됩니다.')
    } catch (err) {
      if (session === authSessionRef.current) setError(err.message)
    }
  }

  async function refreshData(kind) {
    if (loading || saving || machineSaving) return
    const session = authSessionRef.current
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const items = kind === 'machines' ? await listMachines() : await listWorkouts()
      if (session !== authSessionRef.current) return
      if (kind === 'machines') setMachines(items)
      else setWorkouts(items)
    } catch (err) {
      if (session === authSessionRef.current) setError(err.message)
    } finally {
      if (session === authSessionRef.current) setLoading(false)
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
        <form className="planner" onSubmit={saveWorkout} onInvalidCapture={revealInvalidField}>
          <fieldset className="form-fields" disabled={saving || loading}>
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
              {draftMeta.savedAt && !draftMeta.restored && (
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

          <details className="session-info" open={sessionDetailsOpen} onToggle={(event) => setSessionDetailsOpen(event.currentTarget.open)}>
            <summary>
              <span className="session-info__title"><strong>{form.title || '오늘 운동'}</strong><time dateTime={form.workoutDate}><CalendarDays size={14} />{form.workoutDate.replaceAll('-', '. ')}</time></span>
              <span className="session-info__action">루틴 설정 <ChevronDown size={17} /></span>
            </summary>
          <div className="session-info__fields">
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
            <summary>루틴 메모 <span>{form.memo ? '작성됨' : '선택'}</span></summary>
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
          </details>
          </div>

          <div className="exercise-list" ref={exerciseListRef}>
            {form.exercises.map((exercise, exerciseIndex) => (
              <ExerciseCard
                key={exercise.uiId || exerciseIndex}
                exercise={exercise}
                exerciseIndex={exerciseIndex}
                categoryMachines={machinesByCategory[exercise.category]}
                machines={machines}
                updateExercise={updateExercise}
                selectMachine={selectMachine}
                updateSet={updateSet}
                removeExercise={requestRemoveExercise}
                addSet={addSet}
                removeSet={removeSet}
              />
            ))}
          </div>

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={addExercise} disabled={form.exercises.length >= 30} title={form.exercises.length >= 30 ? '운동은 최대 30개까지 기록할 수 있어요' : undefined}>
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
          </fieldset>
        </form>
        <WorkoutSidebar form={form} recentWorkout={selectedWorkout} onDuplicate={duplicateWorkout} disabled={saving || loading} />
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

          {workouts.length > 0 && (
            <section className="insight-overview">
              <button className="insight-toggle" type="button" aria-expanded={showInsights} aria-controls="workout-insights" onClick={() => setShowInsights(!showInsights)}>
                <span><BarChart3 size={20} /><strong>운동 변화 살펴보기</strong></span>
                <ChevronDown size={20} />
              </button>
            <div id="workout-insights" hidden={!showInsights}>
            {showInsights && <InsightsBoundary><Suspense fallback={<div className="data-loading" role="status"><Loader2 className="spin" size={16} /> 통계를 준비하고 있어요.</div>}>
              <WorkoutInsights workouts={workouts} machines={machines} todayTimestamp={todayTimestamp} />
            </Suspense></InsightsBoundary>}
            </div>
            </section>
          )}

          <div className="section-heading">
            <div>
              <h2>운동 내역 <span className="count-label">{filteredWorkouts.length}</span></h2>
            </div>
            <div className="section-heading__actions">
              {hasFilters && <button className="text-button" type="button" onClick={() => setFilters({ query: '', category: 'ALL', from: '', to: '' })}>필터 초기화</button>}
              <button className="text-button" type="button" disabled={loading || saving} onClick={() => refreshData('workouts')}><RefreshCw className={loading ? 'spin' : ''} size={16} /> 새로고침</button>
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
            <div id="history-date-filters" className="date-filters" hidden={!showDateFilters}>
            <label>
              시작 날짜
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label>
              종료 날짜
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </label>
            </div>
          </div>

          <div className="history-periods" aria-label="빠른 날짜 필터">
            {[[0, '전체 기간'], [7, '최근 7일'], [30, '최근 30일']].map(([days, label]) => {
              const from = new Date(`${today}T12:00:00`)
              from.setDate(from.getDate() - days + 1)
              const fromDate = days ? `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}` : ''
              const selected = filters.from === fromDate && filters.to === (days ? today : '')
              return <button type="button" key={days} aria-pressed={selected} onClick={() => setFilters({ ...filters, from: fromDate, to: days ? today : '' })}>{label}</button>
            })}
            <button className="history-periods__custom" type="button" aria-expanded={showDateFilters} aria-controls="history-date-filters" onClick={() => setShowDateFilters(!showDateFilters)}>기간 {showDateFilters ? '접기' : '선택'} <ChevronDown size={15} /></button>
          </div>

          <div className="history-grid">
            {filteredWorkouts.slice(0, historyLimit).map((workout) => (
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
                      disabled={saving || loading}
                      onClick={() => duplicateWorkout(workout)}
                      title="복제해서 새 기록"
                    >
                      <Copy size={16} /><span>불러오기</span>
                    </button>
                    <button
                      className="record-action"
                      type="button"
                      disabled={saving || loading}
                      onClick={() => editWorkout(workout)}
                      aria-label="수정"
                      title="수정"
                    >
                      <Pencil size={16} /><span>수정</span>
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      disabled={saving || loading}
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
                {workout.memo && <p className="record-note">{workout.memo}</p>}
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
                        {exercise.memo && <p className="exercise-summary__note">{exercise.memo}</p>}
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
          {filteredWorkouts.length > 0 && <div className="history-pagination">
            <p role="status">전체 {filteredWorkouts.length}개 중 {Math.min(historyLimit, filteredWorkouts.length)}개 표시</p>
            {filteredWorkouts.length > historyLimit && <button className="secondary-button" type="button" onClick={() => setHistoryLimit((current) => current + HISTORY_PAGE_SIZE)}>기록 더 보기 <ChevronDown size={17} /></button>}
          </div>}
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
            <button className="text-button" type="button" disabled={loading || machineSaving} onClick={() => refreshData('machines')}><RefreshCw className={loading ? 'spin' : ''} size={16} /> 목록 새로고침</button>
          </div>

          <form className="machine-form" onSubmit={saveMachine}>
            <fieldset className="form-fields" disabled={machineSaving || loading}>
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
            </fieldset>
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
