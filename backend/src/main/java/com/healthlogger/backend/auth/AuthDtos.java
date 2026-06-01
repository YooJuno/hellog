package com.healthlogger.backend.auth;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record AuthUserResponse(
            Long id,
            String name,
            String email,
            String pictureUrl
    ) {
    }

    public record AuthStatusResponse(
            boolean authenticated,
            boolean googleLoginEnabled,
            AuthUserResponse user
    ) {
    }
}
