package com.healthlogger.backend.gym;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;

public final class GymMachineDtos {
    private GymMachineDtos() {
    }

    public record MachineRequest(
            @NotBlank String category,
            @NotBlank String name,
            @NotBlank String equipmentType,
            String manufacturer
    ) {
    }

    public record MachineResponse(
            Long id,
            String category,
            String name,
            String equipmentType,
            String manufacturer,
            boolean defaultMachine,
            Instant createdAt
    ) {
    }
}
