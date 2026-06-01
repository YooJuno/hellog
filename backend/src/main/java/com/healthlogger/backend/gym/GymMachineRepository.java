package com.healthlogger.backend.gym;

import com.healthlogger.backend.auth.AppUser;
import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GymMachineRepository extends JpaRepository<GymMachine, Long> {
    @Query("""
            select machine
            from GymMachine machine
            where machine.active = true
              and (
                    machine.owner = :owner
                    or (
                        machine.defaultMachine = true
                        and not exists (
                            select hidden
                            from GymMachine hidden
                            where hidden.owner = :owner
                              and hidden.active = false
                              and hidden.category = machine.category
                              and lower(hidden.name) = lower(machine.name)
                        )
                    )
              )
            order by machine.category asc, machine.equipmentType asc, machine.name asc
            """)
    List<GymMachine> findVisibleMachines(@Param("owner") AppUser owner);

    @Query("""
            select machine
            from GymMachine machine
            where machine.active = true
              and machine.category = :category
              and lower(machine.name) = lower(:name)
              and (
                    machine.owner = :owner
                    or (
                        machine.defaultMachine = true
                        and not exists (
                            select hidden
                            from GymMachine hidden
                            where hidden.owner = :owner
                              and hidden.active = false
                              and hidden.category = machine.category
                              and lower(hidden.name) = lower(machine.name)
                        )
                    )
              )
            """)
    Optional<GymMachine> findDuplicateVisibleMachine(
            @Param("owner") AppUser owner,
            @Param("category") String category,
            @Param("name") String name
    );

    Optional<GymMachine> findByIdAndActiveTrueAndOwner(Long id, AppUser owner);

    Optional<GymMachine> findByIdAndActiveTrue(Long id);

    @Query("""
            select machine
            from GymMachine machine
            where machine.active = true
              and machine.defaultMachine = true
            order by machine.category asc, machine.equipmentType asc, machine.name asc
            """)
    List<GymMachine> findAllDefaults();
}
