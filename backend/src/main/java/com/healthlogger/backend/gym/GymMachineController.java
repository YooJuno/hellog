package com.healthlogger.backend.gym;

import com.healthlogger.backend.auth.AppUser;
import com.healthlogger.backend.auth.CurrentUserService;
import com.healthlogger.backend.gym.GymMachineDtos.MachineRequest;
import com.healthlogger.backend.gym.GymMachineDtos.MachineResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/machines")
@CrossOrigin(origins = {
        "https://btc-trading-agent.com",
        "https://www.btc-trading-agent.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
})
public class GymMachineController {

    private final GymMachineRepository repository;
    private final CurrentUserService currentUserService;

    public GymMachineController(GymMachineRepository repository, CurrentUserService currentUserService) {
        this.repository = repository;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    public List<MachineResponse> findAll() {
        AppUser currentUser = currentUserService.requireCurrentUser();
        return repository.findVisibleMachines(currentUser).stream()
                .map(GymMachineController::toResponse)
                .toList();
    }

    @GetMapping("/defaults")
    public List<MachineResponse> findDefaults() {
        return repository.findAllDefaults().stream()
                .map(GymMachineController::toResponse)
                .toList();
    }

    @PostMapping
    @Transactional
    public ResponseEntity<MachineResponse> create(@Valid @RequestBody MachineRequest request) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        String category = normalize(request.category());
        String name = normalize(request.name());
        String equipmentType = normalize(request.equipmentType());
        String manufacturer = clean(request.manufacturer());

        if (repository.findDuplicateVisibleMachine(currentUser, category, name).isPresent()) {
            throw new ResponseStatusException(CONFLICT, "이미 등록된 운동입니다.");
        }

        GymMachine machine = new GymMachine();
        apply(machine, category, name, equipmentType, manufacturer);
        machine.setOwner(currentUser);
        machine.setDefaultMachine(false);
        GymMachine saved = repository.save(machine);
        return ResponseEntity
                .created(URI.create("/api/machines/" + saved.getId()))
                .body(toResponse(saved));
    }

    @PutMapping("/{id}")
    @Transactional
    public MachineResponse update(@PathVariable Long id, @Valid @RequestBody MachineRequest request) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        GymMachine machine = repository.findByIdAndActiveTrueAndOwner(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "운동을 찾을 수 없습니다."));
        String category = normalize(request.category());
        String name = normalize(request.name());
        String equipmentType = normalize(request.equipmentType());
        String manufacturer = clean(request.manufacturer());

        repository.findDuplicateVisibleMachine(currentUser, category, name)
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> {
                    throw new ResponseStatusException(CONFLICT, "이미 등록된 운동입니다.");
                });

        apply(machine, category, name, equipmentType, manufacturer);
        return toResponse(repository.save(machine));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        var ownedMachine = repository.findByIdAndActiveTrueAndOwner(id, currentUser);
        if (ownedMachine.isPresent()) {
            ownedMachine.get().setActive(false);
            return ResponseEntity.noContent().build();
        }

        GymMachine defaultMachine = repository.findByIdAndActiveTrue(id)
                .filter(GymMachine::isDefaultMachine)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "운동을 찾을 수 없습니다."));
        GymMachine hidden = new GymMachine();
        hidden.setCategory(defaultMachine.getCategory());
        hidden.setName(defaultMachine.getName());
        hidden.setEquipmentType(defaultMachine.getEquipmentType());
        hidden.setManufacturer(defaultMachine.getManufacturer());
        hidden.setOwner(currentUser);
        hidden.setDefaultMachine(false);
        hidden.setActive(false);
        repository.save(hidden);
        return ResponseEntity.noContent().build();
    }

    private static void apply(
            GymMachine machine,
            String category,
            String name,
            String equipmentType,
            String manufacturer
    ) {
        machine.setCategory(category);
        machine.setName(name);
        machine.setEquipmentType(equipmentType);
        machine.setManufacturer("머신".equals(equipmentType) ? manufacturer : null);
    }

    private static String normalize(String value) {
        return value.trim();
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static MachineResponse toResponse(GymMachine machine) {
        return new MachineResponse(
                machine.getId(),
                machine.getCategory(),
                machine.getName(),
                machine.getEquipmentType(),
                machine.getManufacturer(),
                machine.isDefaultMachine(),
                machine.getCreatedAt()
        );
    }
}
