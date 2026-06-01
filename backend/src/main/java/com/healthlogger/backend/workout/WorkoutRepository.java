package com.healthlogger.backend.workout;

import com.healthlogger.backend.auth.AppUser;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkoutRepository extends JpaRepository<WorkoutSession, Long> {
    List<WorkoutSession> findAllByOwnerOrderByWorkoutDateDescCreatedAtDesc(AppUser owner);
    Optional<WorkoutSession> findByIdAndOwner(Long id, AppUser owner);
}
