package com.healthlogger.backend.gym;

import java.util.List;
import java.util.Set;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(1)
public class GymMachineSeeder implements CommandLineRunner {

    private final GymMachineRepository repository;

    public GymMachineSeeder(GymMachineRepository repository) {
        this.repository = repository;
    }

    @Override
    public void run(String... args) {
        List<SeedMachine> seeds = List.of(
                // CHEST
                new SeedMachine("CHEST", "체스트 프레스", "머신"),
                new SeedMachine("CHEST", "펙 덱 플라이", "머신"),
                new SeedMachine("CHEST", "인클라인 체스트 프레스", "머신"),
                new SeedMachine("CHEST", "벤치 프레스", "바벨"),
                new SeedMachine("CHEST", "인클라인 벤치 프레스", "바벨"),
                new SeedMachine("CHEST", "스미스 체스트 프레스", "머신"),
                new SeedMachine("CHEST", "스미스 인클라인 프레스", "머신"),
                new SeedMachine("CHEST", "인클라인 덤벨 프레스", "덤벨"),
                new SeedMachine("CHEST", "덤벨 플라이", "덤벨"),
                new SeedMachine("CHEST", "푸시업", "맨몸"),
                new SeedMachine("CHEST", "딥스", "맨몸"),
                
                // BACK
                new SeedMachine("BACK", "랫 풀다운", "케이블"),
                new SeedMachine("BACK", "시티드 케이블 로우", "케이블"),
                new SeedMachine("BACK", "어시스트 풀업", "머신"),
                new SeedMachine("BACK", "바벨 로우", "바벨"),
                new SeedMachine("BACK", "원암 덤벨 로우", "덤벨"),
                new SeedMachine("BACK", "T바 로우", "머신"),
                new SeedMachine("BACK", "풀업", "맨몸"),
                new SeedMachine("BACK", "백 익스텐션", "맨몸"),
                
                // LEGS
                new SeedMachine("LEGS", "레그 프레스", "머신"),
                new SeedMachine("LEGS", "레그 익스텐션", "머신"),
                new SeedMachine("LEGS", "레그 컬", "머신"),
                new SeedMachine("LEGS", "스쿼트", "바벨"),
                new SeedMachine("LEGS", "스미스 스쿼트", "머신"),
                new SeedMachine("LEGS", "런지", "덤벨"),
                new SeedMachine("LEGS", "힙 쓰러스트", "바벨"),
                new SeedMachine("LEGS", "불가리안 스플릿 스쿼트", "덤벨"),
                new SeedMachine("LEGS", "힙 어브덕션", "머신"),
                new SeedMachine("LEGS", "카프 레이즈", "머신"),
                new SeedMachine("LEGS", "루마니안 데드리프트", "바벨"),
                
                // SHOULDERS
                new SeedMachine("SHOULDERS", "머신 숄더 프레스", "머신"),
                new SeedMachine("SHOULDERS", "덤벨 숄더 프레스", "덤벨"),
                new SeedMachine("SHOULDERS", "사이드 레터럴 레이즈", "덤벨"),
                new SeedMachine("SHOULDERS", "프론트 레이즈", "덤벨"),
                new SeedMachine("SHOULDERS", "리어 델트 플라이", "머신"),
                new SeedMachine("SHOULDERS", "페이스 풀", "케이블"),
                new SeedMachine("SHOULDERS", "업라이트 로우", "바벨"),
                
                // ARMS
                new SeedMachine("ARMS", "바이셉 컬", "바벨"),
                new SeedMachine("ARMS", "덤벨 컬", "덤벨"),
                new SeedMachine("ARMS", "해머 컬", "덤벨"),
                new SeedMachine("ARMS", "프리처 컬", "머신"),
                new SeedMachine("ARMS", "케이블 푸시다운", "케이블"),
                new SeedMachine("ARMS", "오버헤드 트라이셉 익스텐션", "덤벨"),
                new SeedMachine("ARMS", "스컬 크러셔", "바벨"),
                
                // CORE
                new SeedMachine("CORE", "크런치 머신", "머신"),
                new SeedMachine("CORE", "케이블 크런치", "케이블"),
                new SeedMachine("CORE", "행잉 레그 레이즈", "맨몸"),
                new SeedMachine("CORE", "플랭크", "맨몸"),
                new SeedMachine("CORE", "앱 롤아웃", "기타"),
                new SeedMachine("CORE", "러시안 트위스트", "맨몸")
        );

        Set<String> existingKeys = repository.findAll().stream()
                .filter(GymMachine::isActive)
                .filter(GymMachine::isDefaultMachine)
                .map(machine -> key(machine.getCategory(), machine.getName()))
                .collect(java.util.stream.Collectors.toSet());

        List<GymMachine> missingDefaults = seeds.stream()
                .filter(seed -> !existingKeys.contains(key(seed.category(), seed.name())))
                .map(SeedMachine::toEntity)
                .toList();

        if (!missingDefaults.isEmpty()) {
            repository.saveAll(missingDefaults);
        }
    }

    private static String key(String category, String name) {
        return category + "::" + name.trim().toLowerCase();
    }

    private record SeedMachine(String category, String name, String equipmentType) {
        GymMachine toEntity() {
            GymMachine machine = new GymMachine();
            machine.setCategory(category);
            machine.setName(name);
            machine.setEquipmentType(equipmentType);
            machine.setManufacturer(null);
            machine.setDefaultMachine(true);
            return machine;
        }
    }
}
