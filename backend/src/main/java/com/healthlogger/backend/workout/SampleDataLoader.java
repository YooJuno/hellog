package com.healthlogger.backend.workout;

import com.healthlogger.backend.workout.WorkoutDtos.ExerciseRequest;
import com.healthlogger.backend.workout.WorkoutDtos.SetRequest;
import com.healthlogger.backend.workout.WorkoutDtos.WorkoutRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Order(2)
public class SampleDataLoader implements CommandLineRunner {

    private final WorkoutRepository repository;
    private final boolean seedSampleData;

    public SampleDataLoader(
            WorkoutRepository repository,
            @Value("${app.seed-sample-data:false}") boolean seedSampleData
    ) {
        this.repository = repository;
        this.seedSampleData = seedSampleData;
    }

    @Override
    public void run(String... args) {
        if (!seedSampleData) {
            return;
        }

        if (repository.count() > 0) {
            return;
        }

        WorkoutRequest sample = new WorkoutRequest(
                LocalDate.now(),
                "상체 루틴",
                "폼 유지, 마지막 세트만 천천히",
                List.of(
                        new ExerciseRequest(
                                "CHEST",
                                "체스트 프레스",
                                "머신 3번",
                                null,
                                List.of(
                                        new SetRequest(new BigDecimal("40"), 12),
                                        new SetRequest(new BigDecimal("45"), 10),
                                        new SetRequest(new BigDecimal("45"), 8)
                                )
                        ),
                        new ExerciseRequest(
                                "BACK",
                                "랫 풀다운",
                                "케이블",
                                "어깨 내리고 당기기",
                                List.of(
                                        new SetRequest(new BigDecimal("35"), 12),
                                        new SetRequest(new BigDecimal("40"), 10),
                                        new SetRequest(new BigDecimal("40"), 10)
                                )
                        )
                )
        );
        repository.save(WorkoutMapper.toEntity(sample));
    }
}
