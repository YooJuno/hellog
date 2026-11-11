import { memo, useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, BarChart3, PieChart, Target } from 'lucide-react'
import { categoryLabel, exerciseCategory, formatNumber } from '../lib/workoutUtils.js'

/* eslint-disable react/prop-types */

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

function WorkoutInsights({ workouts, machines, todayTimestamp }) {
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
  }, [machines, workouts, todayTimestamp])

  if (!insights) return null

  return (
    <section className="insight-board" aria-label="운동 인사이트">
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
  )
}

export default memo(WorkoutInsights)
