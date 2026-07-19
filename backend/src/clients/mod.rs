use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, patch},
    Json, Router,
};

use crate::{
    accounts::{CurrentUser, ErrorResponse},
    http::AppState,
};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Client {
    pub id: Uuid,
    pub user_sub: String,
    pub name: String,
    pub initials: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct UserSettings {
    pub user_sub: String,
    pub personal_color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ClientPayload {
    pub name: String,
    pub initials: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct PersonalColorPayload {
    pub personal_color: String,
}

#[derive(Debug, Serialize)]
pub struct ClientListResponse {
    pub clients: Vec<Client>,
    pub personal_color: String,
}

#[derive(Debug, Serialize)]
pub struct ClientResponse {
    pub client: Client,
}

#[derive(Debug, Serialize)]
pub struct UserSettingsResponse {
    pub settings: UserSettings,
}

#[derive(Debug)]
struct ValidatedClient {
    name: String,
    initials: String,
    color: String,
}

#[derive(Debug)]
pub enum ClientApiError {
    BadRequest(&'static str),
    NotFound(&'static str),
    Conflict(&'static str),
    Internal,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/clients",
            get(list_clients_handler).post(create_client_handler),
        )
        .route(
            "/api/clients/{client_id}",
            patch(update_client_handler).delete(delete_client_handler),
        )
        .route(
            "/api/clients/personal-color",
            patch(update_personal_color_handler),
        )
}

async fn list_clients_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
) -> Result<Json<ClientListResponse>, ClientApiError> {
    let settings = get_or_create_user_settings(&state.db, &current_user.0.sub).await?;
    let clients = list_clients(&state.db, &current_user.0.sub).await?;

    Ok(Json(ClientListResponse {
        clients,
        personal_color: settings.personal_color,
    }))
}

async fn create_client_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Json(payload): Json<ClientPayload>,
) -> Result<(StatusCode, Json<ClientResponse>), ClientApiError> {
    let client = create_client(&state.db, &current_user.0.sub, payload).await?;

    Ok((StatusCode::CREATED, Json(ClientResponse { client })))
}

async fn update_client_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Path(client_id): Path<Uuid>,
    Json(payload): Json<ClientPayload>,
) -> Result<Json<ClientResponse>, ClientApiError> {
    let client = update_client(&state.db, &current_user.0.sub, client_id, payload).await?;

    Ok(Json(ClientResponse { client }))
}

async fn delete_client_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Path(client_id): Path<Uuid>,
) -> Result<StatusCode, ClientApiError> {
    delete_client(&state.db, &current_user.0.sub, client_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn update_personal_color_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Json(payload): Json<PersonalColorPayload>,
) -> Result<Json<UserSettingsResponse>, ClientApiError> {
    let personal_color = normalize_color(&payload.personal_color)?;
    let settings = update_personal_color(&state.db, &current_user.0.sub, &personal_color).await?;

    Ok(Json(UserSettingsResponse { settings }))
}

async fn list_clients(pool: &PgPool, user_sub: &str) -> Result<Vec<Client>, ClientApiError> {
    sqlx::query_as::<_, Client>(
        r#"
        SELECT id, user_sub, name, initials, color, created_at, updated_at
        FROM clients
        WHERE user_sub = $1
        ORDER BY LOWER(name), created_at
        "#,
    )
    .bind(user_sub)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)
}

async fn create_client(
    pool: &PgPool,
    user_sub: &str,
    payload: ClientPayload,
) -> Result<Client, ClientApiError> {
    let client = validate_client_payload(payload)?;
    get_or_create_user_settings(pool, user_sub).await?;

    sqlx::query_as::<_, Client>(
        r#"
        INSERT INTO clients (user_sub, name, initials, color)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_sub, name, initials, color, created_at, updated_at
        "#,
    )
    .bind(user_sub)
    .bind(client.name)
    .bind(client.initials)
    .bind(client.color)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn update_client(
    pool: &PgPool,
    user_sub: &str,
    client_id: Uuid,
    payload: ClientPayload,
) -> Result<Client, ClientApiError> {
    let client = validate_client_payload(payload)?;
    get_or_create_user_settings(pool, user_sub).await?;

    sqlx::query_as::<_, Client>(
        r#"
        UPDATE clients
        SET name = $3,
            initials = $4,
            color = $5
        WHERE id = $1
          AND user_sub = $2
        RETURNING id, user_sub, name, initials, color, created_at, updated_at
        "#,
    )
    .bind(client_id)
    .bind(user_sub)
    .bind(client.name)
    .bind(client.initials)
    .bind(client.color)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ClientApiError::NotFound("client not found"))
}

async fn delete_client(
    pool: &PgPool,
    user_sub: &str,
    client_id: Uuid,
) -> Result<(), ClientApiError> {
    let result = sqlx::query(
        r#"
        DELETE FROM clients
        WHERE id = $1
          AND user_sub = $2
        "#,
    )
    .bind(client_id)
    .bind(user_sub)
    .execute(pool)
    .await
    .map_err(map_database_error)?;

    if result.rows_affected() == 0 {
        return Err(ClientApiError::NotFound("client not found"));
    }

    Ok(())
}

async fn get_or_create_user_settings(
    pool: &PgPool,
    user_sub: &str,
) -> Result<UserSettings, ClientApiError> {
    sqlx::query_as::<_, UserSettings>(
        r#"
        WITH inserted AS (
            INSERT INTO user_settings (user_sub)
            VALUES ($1)
            ON CONFLICT (user_sub) DO NOTHING
            RETURNING user_sub, personal_color, created_at, updated_at
        )
        SELECT user_sub, personal_color, created_at, updated_at
        FROM inserted
        UNION ALL
        SELECT user_sub, personal_color, created_at, updated_at
        FROM user_settings
        WHERE user_sub = $1
        LIMIT 1
        "#,
    )
    .bind(user_sub)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn update_personal_color(
    pool: &PgPool,
    user_sub: &str,
    personal_color: &str,
) -> Result<UserSettings, ClientApiError> {
    sqlx::query_as::<_, UserSettings>(
        r#"
        INSERT INTO user_settings (user_sub, personal_color)
        VALUES ($1, $2)
        ON CONFLICT (user_sub) DO UPDATE
        SET personal_color = EXCLUDED.personal_color
        RETURNING user_sub, personal_color, created_at, updated_at
        "#,
    )
    .bind(user_sub)
    .bind(personal_color)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

fn validate_client_payload(payload: ClientPayload) -> Result<ValidatedClient, ClientApiError> {
    let name = payload.name.trim().to_owned();
    if name.is_empty() {
        return Err(ClientApiError::BadRequest("client name is required"));
    }
    if name.eq_ignore_ascii_case("personal") {
        return Err(ClientApiError::BadRequest(
            "Personal is reserved for personal time",
        ));
    }

    let initials = payload.initials.trim().to_owned();
    if initials.is_empty() {
        return Err(ClientApiError::BadRequest("client initials are required"));
    }
    if initials.chars().count() > 4 {
        return Err(ClientApiError::BadRequest(
            "client initials must be 4 characters or fewer",
        ));
    }

    let color = normalize_color(&payload.color)?;

    Ok(ValidatedClient {
        name,
        initials,
        color,
    })
}

fn normalize_color(color: &str) -> Result<String, ClientApiError> {
    let color = color.trim();
    let hex = color
        .strip_prefix('#')
        .ok_or(ClientApiError::BadRequest("color must be a hex value"))?;

    if hex.len() != 6 || !hex.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(ClientApiError::BadRequest("color must be a hex value"));
    }

    Ok(format!("#{}", hex.to_ascii_uppercase()))
}

fn map_database_error(error: sqlx::Error) -> ClientApiError {
    match error {
        sqlx::Error::Database(database_error) => {
            let message = database_error.message();
            match database_error.constraint() {
                Some("clients_user_name_unique_idx") => {
                    ClientApiError::Conflict("client name already exists")
                }
                Some("clients_user_color_unique_idx") => {
                    ClientApiError::Conflict("client color already exists")
                }
                _ if database_error.code().as_deref() == Some("23514") => {
                    ClientApiError::BadRequest("invalid client data")
                }
                _ if database_error.code().as_deref() == Some("P0001")
                    && message.contains("distinct") =>
                {
                    ClientApiError::Conflict("colors must be distinct")
                }
                _ => {
                    tracing::error!("client database operation failed: {database_error}");
                    ClientApiError::Internal
                }
            }
        }
        other_error => {
            tracing::error!("client database operation failed: {other_error}");
            ClientApiError::Internal
        }
    }
}

impl IntoResponse for ClientApiError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            Self::BadRequest(error) => (StatusCode::BAD_REQUEST, error),
            Self::NotFound(error) => (StatusCode::NOT_FOUND, error),
            Self::Conflict(error) => (StatusCode::CONFLICT, error),
            Self::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "client operation failed"),
        };

        (status, Json(ErrorResponse { error })).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_color, validate_client_payload, ClientPayload};

    #[test]
    fn validates_and_normalizes_client_payload() {
        let result = validate_client_payload(ClientPayload {
            name: " Acme ".to_owned(),
            initials: " ac ".to_owned(),
            color: " #22c55e ".to_owned(),
        });

        assert!(result.is_ok());
        match result {
            Ok(client) => {
                assert_eq!(client.name, "Acme");
                assert_eq!(client.initials, "ac");
                assert_eq!(client.color, "#22C55E");
            }
            Err(_) => panic!("client payload should be valid"),
        }
    }

    #[test]
    fn rejects_invalid_colors() {
        assert!(normalize_color("22c55e").is_err());
        assert!(normalize_color("#22c55").is_err());
        assert!(normalize_color("#22c55x").is_err());
    }

    #[test]
    fn rejects_reserved_personal_client_name() {
        let result = validate_client_payload(ClientPayload {
            name: " Personal ".to_owned(),
            initials: "P".to_owned(),
            color: "#64748B".to_owned(),
        });

        assert!(result.is_err());
    }
}
