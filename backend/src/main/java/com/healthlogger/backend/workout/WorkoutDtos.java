package com.healthlogger.backend.workout;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class WorkoutDtos {
    private WorkoutDtos() {
    }

    public record WorkoutRequest(
            @NotNull LocalDate workoutDate,
            @NotBlank String title,
            String memo,
            @NotEmpty List<@Valid ExerciseRequest> exercises
    ) {
    }

    public record ExerciseRequest(
            String category,
            @NotBlank String exerciseName,
            String equipment,
            String memo,
            @NotEmpty List<@Valid SetRequest> sets
    ) {
    }

    public record SetRequest(
            @NotNull @DecimalMin("0.0") BigDecimal weightKg,
            @Min(1) int reps
    ) {
    }

    public record WorkoutResponse(
            Long id,
            LocalDate workoutDate,
            String title,
            String memo,
            Instant createdAt,
            int totalSets,
            int totalReps,
            BigDecimal totalVolume,
            List<ExerciseResponse> exercises
    ) {
    }

    public record ExerciseResponse(
            Long id,
            int position,
            String category,
            String exerciseName,
            String equipment,
            String memo,
            List<SetResponse> sets
    ) {
    }

    public record SetResponse(
            Long id,
            int setNumber,
            BigDecimal weightKg,
            int reps
    ) {
    }
}
