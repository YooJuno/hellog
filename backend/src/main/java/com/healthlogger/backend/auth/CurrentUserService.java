package com.healthlogger.backend.auth;

import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@Service
public class CurrentUserService {

    private final AppUserRepository repository;

    public CurrentUserService(AppUserRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public AppUser requireCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof OAuth2User principal)) {
            throw new ResponseStatusException(UNAUTHORIZED, "로그인이 필요합니다.");
        }

        String subject = attribute(principal.getAttributes(), "sub");
        if (subject == null || subject.isBlank()) {
            throw new ResponseStatusException(UNAUTHORIZED, "Google 사용자 정보를 읽을 수 없습니다.");
        }

        AppUser user = repository.findByGoogleSubject(subject).orElseGet(AppUser::new);
        user.setGoogleSubject(subject);
        user.setEmail(attribute(principal.getAttributes(), "email"));
        user.setName(attribute(principal.getAttributes(), "name"));
        user.setPictureUrl(attribute(principal.getAttributes(), "picture"));
        user.setLastLoginAt(Instant.now());
        return repository.save(user);
    }

    public AuthDtos.AuthUserResponse currentUserProfile() {
        AppUser user = requireCurrentUser();
        return new AuthDtos.AuthUserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPictureUrl()
        );
    }

    private static String attribute(Map<String, Object> attributes, String key) {
        Object value = attributes.get(key);
        return value == null ? null : String.valueOf(value);
    }
}
