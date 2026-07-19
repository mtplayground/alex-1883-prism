use axum::{
    extract::{Extension, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

use crate::{auth, http::AppState};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct User {
    pub sub: String,
    pub email: String,
    pub name: Option<String>,
    pub picture_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UserClaims {
    pub sub: String,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegistrationResponse {
    pub user: User,
}

#[derive(Debug, Clone)]
pub struct CurrentUser(pub User);

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: &'static str,
}

pub type AuthResponse = (StatusCode, Json<ErrorResponse>);

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<RegistrationResponse>, AuthResponse> {
    let claims = auth::verify_session(&headers, &state.config)
        .await
        .map_err(auth_error_response)?;

    let user = upsert_user(&state.db, &claims).await.map_err(|err| {
        tracing::error!("failed to upsert registered user: {err}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "registration failed",
            }),
        )
    })?;

    Ok(Json(RegistrationResponse { user }))
}

pub async fn me(Extension(current_user): Extension<CurrentUser>) -> Json<RegistrationResponse> {
    Json(RegistrationResponse {
        user: current_user.0,
    })
}

pub async fn upsert_user(pool: &PgPool, claims: &UserClaims) -> anyhow::Result<User> {
    sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (sub, email, name, picture_url)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (sub) DO UPDATE
        SET email = EXCLUDED.email,
            name = EXCLUDED.name,
            picture_url = EXCLUDED.picture_url,
            last_seen_at = NOW()
        RETURNING sub, email, name, picture_url, created_at, updated_at, last_seen_at
        "#,
    )
    .bind(&claims.sub)
    .bind(&claims.email)
    .bind(&claims.name)
    .bind(&claims.picture)
    .fetch_one(pool)
    .await
    .map_err(|err| anyhow::anyhow!("user upsert query failed: {err}"))
}

fn auth_error_response(error: auth::AuthError) -> AuthResponse {
    auth_error_response_with_message(error, "authentication required")
}

pub fn auth_error_response_with_message(
    error: auth::AuthError,
    unauthorized_error: &'static str,
) -> AuthResponse {
    match error {
        auth::AuthError::MissingSession | auth::AuthError::InvalidSession => (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: unauthorized_error,
            }),
        ),
        auth::AuthError::VerificationUnavailable => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "authentication unavailable",
            }),
        ),
    }
}
