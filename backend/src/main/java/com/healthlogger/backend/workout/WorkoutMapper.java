package com.healthlogger.backend.workout;

import com.healthlogger.backend.workout.WorkoutDtos.ExerciseRequest;
import com.healthlogger.backend.workout.WorkoutDtos.ExerciseResponse;
import com.healthlogger.backend.workout.WorkoutDtos.SetRequest;
import com.healthlogger.backend.workout.WorkoutDtos.SetResponse;
import com.healthlogger.backend.workout.WorkoutDtos.WorkoutRequest;
import com.healthlogger.backend.workout.WorkoutDtos.WorkoutResponse;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

final class WorkoutMapper {
    private WorkoutMapper() {
    }

    static WorkoutSession toEntity(WorkoutRequest request) {
        WorkoutSession session = new WorkoutSession();
        apply(session, request);
        return session;
    }

    static void apply(WorkoutSession session, WorkoutRequest request) {
        session.setWorkoutDate(request.workoutDate());
        session.setTitle(request.title().trim());
        session.setMemo(clean(request.memo()));
        session.replaceExercises(toExercises(request.exercises()));
    }

    static WorkoutResponse toResponse(WorkoutSession session) {
        List<ExerciseResponse> exercises = session.getExercises().stream()
                .map(WorkoutMapper::toExerciseResponse)
                .toList();

        int totalSets = exercises.stream().mapToInt(exercise -> exercise.sets().size()).sum();
        int totalReps = exercises.stream()
                .flatMap(exercise -> exercise.sets().stream())
                .mapToInt(SetResponse::reps)
                .sum();
        BigDecimal totalVolume = exercises.stream()
                .flatMap(exercise -> exercise.sets().stream())
                .map(set -> set.weightKg().multiply(BigDecimal.valueOf(set.reps())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new WorkoutResponse(
                session.getId(),
                session.getWorkoutDate(),
                session.getTitle(),
                session.getMemo(),
                session.getCreatedAt(),
                totalSets,
                totalReps,
                totalVolume,
                exercises
        );
    }

    private static List<ExerciseEntry> toExercises(List<ExerciseRequest> requests) {
        List<ExerciseEntry> exercises = new ArrayList<>();
        for (int index = 0; index < requests.size(); index++) {
            ExerciseRequest request = requests.get(index);
            ExerciseEntry exercise = new ExerciseEntry();
            exercise.setPosition(index + 1);
            exercise.setCategory(clean(request.category()));
            exercise.setExerciseName(request.exerciseName().trim());
            exercise.setEquipment(clean(request.equipment()));
            exercise.setMemo(clean(request.memo()));

            for (int setIndex = 0; setIndex < request.sets().size(); setIndex++) {
                SetRequest setRequest = request.sets().get(setIndex);
                WorkoutSet set = new WorkoutSet();
                set.setSetNumber(setIndex + 1);
                set.setWeightKg(setRequest.weightKg());
                set.setReps(setRequest.reps());
                exercise.addSet(set);
            }
            exercises.add(exercise);
        }
        return exercises;
    }

    private static ExerciseResponse toExerciseResponse(ExerciseEntry exercise) {
        return new ExerciseResponse(
                exercise.getId(),
                exercise.getPosition(),
                exercise.getCategory(),
                exercise.getExerciseName(),
                exercise.getEquipment(),
                exercise.getMemo(),
                exercise.getSets().stream().map(WorkoutMapper::toSetResponse).toList()
        );
    }

    private static SetResponse toSetResponse(WorkoutSet set) {
        return new SetResponse(set.getId(), set.getSetNumber(), set.getWeightKg(), set.getReps());
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
