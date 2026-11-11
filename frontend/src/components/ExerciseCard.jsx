import { memo, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CATEGORIES, categoryLabel, findMachine, groupByEquipment, machineManufacturer } from '../lib/workoutUtils.js'

/* eslint-disable react/prop-types */
function ExerciseCard({ exercise, exerciseIndex, categoryMachines, machines, updateExercise, selectMachine, updateSet, removeExercise, addSet, removeSet }) {
  const groupedOptions = useMemo(() => groupByEquipment(categoryMachines), [categoryMachines])
  const selectedMachine = findMachine(machines, exercise)
  const manufacturer = exercise.manufacturer || machineManufacturer(selectedMachine)
  return (
    <article className="exercise-card">
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
          onClick={() => removeExercise(exerciseIndex, exercise)}
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
              disabled={exercise.sets.length === 1}
              title={exercise.sets.length === 1 ? '세트는 하나 이상 필요해요' : '세트 삭제'}
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

      <details className="exercise-note" open={Boolean(exercise.memo)}>
        <summary>운동 메모 <span>{exercise.memo ? '작성됨' : '선택'}</span></summary>
        <label>
          <span className="sr-only">운동 {exerciseIndex + 1} 메모</span>
          <input
            value={exercise.memo}
            onChange={(event) => updateExercise(exerciseIndex, 'memo', event.target.value)}
            placeholder="그립, 의자 높이, 자세 포인트"
          />
        </label>
      </details>
    </article>
  )
}

export default memo(ExerciseCard)
