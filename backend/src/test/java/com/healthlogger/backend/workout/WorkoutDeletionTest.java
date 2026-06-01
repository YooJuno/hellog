package com.healthlogger.backend.workout;

import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class WorkoutDeletionTest {

    @Autowired
    private WorkoutRepository repository;

    @Autowired
    private EntityManager entityManager;

    @Test
    void deleteRemovesWorkoutSession() {
        WorkoutDtos.WorkoutRequest request = new WorkoutDtos.WorkoutRequest(
                LocalDate.of(2026, 6, 1),
                "삭제 테스트",
                null,
                List.of(new WorkoutDtos.ExerciseRequest(
                        "CHEST",
                        "체스트 프레스",
                        "머신",
                        null,
                        List.of(new WorkoutDtos.SetRequest(BigDecimal.valueOf(40), 10))
                ))
        );

        WorkoutSession saved = repository.saveAndFlush(WorkoutMapper.toEntity(request));
        Long id = saved.getId();

        repository.delete(saved);
        repository.flush();
        entityManager.clear();

        assertTrue(repository.findById(id).isEmpty());
    }
}
