package com.healthlogger.backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final CurrentUserService currentUserService;
    private final boolean googleLoginEnabled;

    public AuthController(
            CurrentUserService currentUserService,
            @Value("${app.auth.google-enabled:true}") boolean googleLoginEnabled
    ) {
        this.currentUserService = currentUserService;
        this.googleLoginEnabled = googleLoginEnabled;
    }

    @GetMapping("/me")
    public AuthDtos.AuthStatusResponse me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
            return new AuthDtos.AuthStatusResponse(false, googleLoginEnabled, null);
        }

        return new AuthDtos.AuthStatusResponse(
                true,
                googleLoginEnabled,
                currentUserService.currentUserProfile()
        );
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) {
        if (authentication != null) {
            new SecurityContextLogoutHandler().logout(request, response, authentication);
        }
        return ResponseEntity.noContent().build();
    }
}
