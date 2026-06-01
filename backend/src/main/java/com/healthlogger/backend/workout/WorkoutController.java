package com.healthlogger.backend.workout;

import com.healthlogger.backend.auth.AppUser;
import com.healthlogger.backend.auth.CurrentUserService;
import com.healthlogger.backend.workout.WorkoutDtos.WorkoutRequest;
import com.healthlogger.backend.workout.WorkoutDtos.WorkoutResponse;
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

import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/workouts")
@CrossOrigin(origins = {
        "https://btc-trading-agent.com",
        "https://www.btc-trading-agent.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
})
public class WorkoutController {

    private final WorkoutRepository repository;
    private final CurrentUserService currentUserService;

    public WorkoutController(WorkoutRepository repository, CurrentUserService currentUserService) {
        this.repository = repository;
        this.currentUserService = currentUserService;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<WorkoutResponse> findAll() {
        AppUser currentUser = currentUserService.requireCurrentUser();
        return repository.findAllByOwnerOrderByWorkoutDateDescCreatedAtDesc(currentUser).stream()
                .map(WorkoutMapper::toResponse)
                .toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public WorkoutResponse findOne(@PathVariable Long id) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        return repository.findByIdAndOwner(id, currentUser)
                .map(WorkoutMapper::toResponse)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Workout not found"));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<WorkoutResponse> create(@Valid @RequestBody WorkoutRequest request) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        WorkoutSession session = WorkoutMapper.toEntity(request);
        session.setOwner(currentUser);
        WorkoutSession saved = repository.save(session);
        return ResponseEntity
                .created(URI.create("/api/workouts/" + saved.getId()))
                .body(WorkoutMapper.toResponse(saved));
    }

    @PutMapping("/{id}")
    @Transactional
    public WorkoutResponse update(@PathVariable Long id, @Valid @RequestBody WorkoutRequest request) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        WorkoutSession session = repository.findByIdAndOwner(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Workout not found"));
        WorkoutMapper.apply(session, request);
        return WorkoutMapper.toResponse(repository.save(session));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        AppUser currentUser = currentUserService.requireCurrentUser();
        WorkoutSession session = repository.findByIdAndOwner(id, currentUser)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Workout not found"));
        repository.delete(session);
        repository.flush();
        return ResponseEntity.noContent().build();
    }
}
