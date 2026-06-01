package com.healthlogger.backend.workout;

import com.healthlogger.backend.auth.AppUser;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.FetchType;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
public class WorkoutSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    private LocalDate workoutDate;

    @NotBlank
    private String title;

    private String memo;

    private Instant createdAt = Instant.now();

    @ManyToOne(fetch = FetchType.LAZY)
    private AppUser owner;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<ExerciseEntry> exercises = new ArrayList<>();

    public Long getId() {
        return id;
    }

    public LocalDate getWorkoutDate() {
        return workoutDate;
    }

    public void setWorkoutDate(LocalDate workoutDate) {
        this.workoutDate = workoutDate;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getMemo() {
        return memo;
    }

    public void setMemo(String memo) {
        this.memo = memo;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public AppUser getOwner() {
        return owner;
    }

    public void setOwner(AppUser owner) {
        this.owner = owner;
    }

    public List<ExerciseEntry> getExercises() {
        return exercises;
    }

    public void replaceExercises(List<ExerciseEntry> nextExercises) {
        exercises.clear();
        nextExercises.forEach(this::addExercise);
    }

    public void addExercise(ExerciseEntry exercise) {
        exercise.setSession(this);
        exercises.add(exercise);
    }
}
