import { RotateCcw } from 'lucide-react'
import './WorkoutSidebar.css'

// This presentation component receives the existing workout form model.
/* eslint-disable react/prop-types */

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

export default function WorkoutSidebar({ form, recentWorkout, onDuplicate }) {
  const selectedExercises = form.exercises.filter((exercise) => exercise.exerciseName.trim())
  const totalSets = selectedExercises.reduce((total, exercise) => total + exercise.sets.length, 0)
  const totalVolume = selectedExercises.reduce(
    (total, exercise) => total + exercise.sets.reduce(
      (volume, set) => volume + Number(set.weightKg || 0) * Number(set.reps || 0),
      0,
    ),
    0,
  )

  return (
    <aside className="workout-sidebar" aria-label="현재 운동 요약">
      <section className="session-summary" aria-labelledby="session-summary-title">
        <p className="session-summary__eyebrow">SESSION</p>
        <h2 id="session-summary-title">오늘의 구성</h2>

        <dl className="session-summary__stats">
          <div>
            <dt>운동</dt>
            <dd>{selectedExercises.length}<span>개</span></dd>
          </div>
          <div>
            <dt>세트</dt>
            <dd>{totalSets}<span>세트</span></dd>
          </div>
          <div>
            <dt>볼륨</dt>
            <dd>{formatNumber(totalVolume)}<span>kg</span></dd>
          </div>
        </dl>

        {selectedExercises.length > 0 ? (
          <ol className="session-summary__exercises">
            {selectedExercises.map((exercise, index) => (
              <li key={`${index}-${exercise.exerciseName}`}>
                <span className="session-summary__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="session-summary__exercise-name">{exercise.exerciseName}</span>
                <span className="session-summary__set-count">{exercise.sets.length}세트</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="session-summary__empty">운동을 선택하면 여기에 정리됩니다.</p>
        )}

        <p className="session-summary__note">볼륨 = 무게 × 횟수의 합</p>
      </section>

      {recentWorkout && (
        <section className="recent-routine" aria-labelledby="recent-routine-title">
          <h3 id="recent-routine-title">지난 루틴 이어가기</h3>
          <time className="recent-routine__date" dateTime={recentWorkout.workoutDate}>
            {recentWorkout.workoutDate}
          </time>
          <p className="recent-routine__name">{recentWorkout.title}</p>
          <p className="recent-routine__meta">총 {recentWorkout.totalSets}세트</p>
          <button type="button" className="recent-routine__button" onClick={() => onDuplicate(recentWorkout)}>
            <RotateCcw size={16} aria-hidden="true" />
            이 루틴으로 시작
          </button>
        </section>
      )}
    </aside>
  )
}
