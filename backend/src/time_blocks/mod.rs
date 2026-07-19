use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, patch},
    Json, Router,
};

use crate::{
    accounts::{CurrentUser, ErrorResponse},
    http::AppState,
};

pub const CATEGORY_CLIENT: &str = "client";
pub const CATEGORY_PERSONAL: &str = "personal";
pub const PERSONAL_INITIALS: &str = "P";
const DEFAULT_PERSONAL_COLOR: &str = "#64748B";

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TimeBlock {
    pub id: Uuid,
    pub user_sub: String,
    pub day: NaiveDate,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub title: Option<String>,
    pub category: String,
    pub client_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TimeBlockWithAppearance {
    pub id: Uuid,
    pub user_sub: String,
    pub day: NaiveDate,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub title: Option<String>,
    pub category: String,
    pub client_id: Option<Uuid>,
    pub color: String,
    pub initials: String,
    pub client_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl TimeBlock {
    pub fn is_personal(&self) -> bool {
        self.category == CATEGORY_PERSONAL
    }

    pub fn is_client_block(&self) -> bool {
        self.category == CATEGORY_CLIENT
    }
}

#[derive(Debug, Deserialize)]
pub struct ListTimeBlocksQuery {
    pub day: String,
}

#[derive(Debug, Deserialize)]
pub struct TimeBlockPayload {
    pub day: String,
    pub start_time: String,
    pub end_time: String,
    pub title: Option<String>,
    pub category: String,
    pub client_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct TimeBlockListResponse {
    pub blocks: Vec<TimeBlockWithAppearance>,
}

#[derive(Debug, Serialize)]
pub struct TimeBlockResponse {
    pub block: TimeBlockWithAppearance,
}

#[derive(Debug)]
struct ValidatedTimeBlock {
    day: NaiveDate,
    start_time: NaiveTime,
    end_time: NaiveTime,
    title: Option<String>,
    category: String,
    client_id: Option<Uuid>,
}

#[derive(Debug)]
pub enum TimeBlockApiError {
    BadRequest(&'static str),
    NotFound(&'static str),
    Internal,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/time-blocks",
            get(list_time_blocks_handler).post(create_time_block_handler),
        )
        .route(
            "/api/time-blocks/{block_id}",
            patch(update_time_block_handler).delete(delete_time_block_handler),
        )
}

async fn list_time_blocks_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Query(query): Query<ListTimeBlocksQuery>,
) -> Result<Json<TimeBlockListResponse>, TimeBlockApiError> {
    let day = parse_day(&query.day)?;
    let blocks = list_time_blocks(&state.db, &current_user.0.sub, day).await?;

    Ok(Json(TimeBlockListResponse { blocks }))
}

async fn create_time_block_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Json(payload): Json<TimeBlockPayload>,
) -> Result<(StatusCode, Json<TimeBlockResponse>), TimeBlockApiError> {
    let block = create_time_block(&state.db, &current_user.0.sub, payload).await?;

    Ok((StatusCode::CREATED, Json(TimeBlockResponse { block })))
}

async fn update_time_block_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Path(block_id): Path<Uuid>,
    Json(payload): Json<TimeBlockPayload>,
) -> Result<Json<TimeBlockResponse>, TimeBlockApiError> {
    let block = update_time_block(&state.db, &current_user.0.sub, block_id, payload).await?;

    Ok(Json(TimeBlockResponse { block }))
}

async fn delete_time_block_handler(
    State(state): State<AppState>,
    Extension(current_user): Extension<CurrentUser>,
    Path(block_id): Path<Uuid>,
) -> Result<StatusCode, TimeBlockApiError> {
    delete_time_block(&state.db, &current_user.0.sub, block_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn list_time_blocks(
    pool: &PgPool,
    user_sub: &str,
    day: NaiveDate,
) -> Result<Vec<TimeBlockWithAppearance>, TimeBlockApiError> {
    sqlx::query_as::<_, TimeBlockWithAppearance>(
        r#"
        SELECT
            time_blocks.id,
            time_blocks.user_sub,
            time_blocks.day,
            time_blocks.start_time,
            time_blocks.end_time,
            time_blocks.title,
            time_blocks.category,
            time_blocks.client_id,
            CASE
                WHEN time_blocks.category = 'personal'
                THEN COALESCE(user_settings.personal_color, $3)
                ELSE clients.color
            END AS color,
            CASE
                WHEN time_blocks.category = 'personal'
                THEN $4
                ELSE clients.initials
            END AS initials,
            clients.name AS client_name,
            time_blocks.created_at,
            time_blocks.updated_at
        FROM time_blocks
        LEFT JOIN clients
          ON clients.user_sub = time_blocks.user_sub
         AND clients.id = time_blocks.client_id
        LEFT JOIN user_settings
          ON user_settings.user_sub = time_blocks.user_sub
        WHERE time_blocks.user_sub = $1
          AND time_blocks.day = $2
        ORDER BY time_blocks.start_time, time_blocks.end_time, time_blocks.created_at
        "#,
    )
    .bind(user_sub)
    .bind(day)
    .bind(DEFAULT_PERSONAL_COLOR)
    .bind(PERSONAL_INITIALS)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)
}

async fn create_time_block(
    pool: &PgPool,
    user_sub: &str,
    payload: TimeBlockPayload,
) -> Result<TimeBlockWithAppearance, TimeBlockApiError> {
    let block = validate_time_block_payload(payload)?;

    let block_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO time_blocks (
            user_sub,
            day,
            start_time,
            end_time,
            title,
            category,
            client_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
    )
    .bind(user_sub)
    .bind(block.day)
    .bind(block.start_time)
    .bind(block.end_time)
    .bind(block.title)
    .bind(block.category)
    .bind(block.client_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;

    get_time_block(pool, user_sub, block_id).await
}

async fn update_time_block(
    pool: &PgPool,
    user_sub: &str,
    block_id: Uuid,
    payload: TimeBlockPayload,
) -> Result<TimeBlockWithAppearance, TimeBlockApiError> {
    let block = validate_time_block_payload(payload)?;

    let updated_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        UPDATE time_blocks
        SET day = $3,
            start_time = $4,
            end_time = $5,
            title = $6,
            category = $7,
            client_id = $8
        WHERE id = $1
          AND user_sub = $2
        RETURNING id
        "#,
    )
    .bind(block_id)
    .bind(user_sub)
    .bind(block.day)
    .bind(block.start_time)
    .bind(block.end_time)
    .bind(block.title)
    .bind(block.category)
    .bind(block.client_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(TimeBlockApiError::NotFound("time block not found"))?;

    get_time_block(pool, user_sub, updated_id).await
}

async fn delete_time_block(
    pool: &PgPool,
    user_sub: &str,
    block_id: Uuid,
) -> Result<(), TimeBlockApiError> {
    let result = sqlx::query(
        r#"
        DELETE FROM time_blocks
        WHERE id = $1
          AND user_sub = $2
        "#,
    )
    .bind(block_id)
    .bind(user_sub)
    .execute(pool)
    .await
    .map_err(map_database_error)?;

    if result.rows_affected() == 0 {
        return Err(TimeBlockApiError::NotFound("time block not found"));
    }

    Ok(())
}

async fn get_time_block(
    pool: &PgPool,
    user_sub: &str,
    block_id: Uuid,
) -> Result<TimeBlockWithAppearance, TimeBlockApiError> {
    sqlx::query_as::<_, TimeBlockWithAppearance>(
        r#"
        SELECT
            time_blocks.id,
            time_blocks.user_sub,
            time_blocks.day,
            time_blocks.start_time,
            time_blocks.end_time,
            time_blocks.title,
            time_blocks.category,
            time_blocks.client_id,
            CASE
                WHEN time_blocks.category = 'personal'
                THEN COALESCE(user_settings.personal_color, $3)
                ELSE clients.color
            END AS color,
            CASE
                WHEN time_blocks.category = 'personal'
                THEN $4
                ELSE clients.initials
            END AS initials,
            clients.name AS client_name,
            time_blocks.created_at,
            time_blocks.updated_at
        FROM time_blocks
        LEFT JOIN clients
          ON clients.user_sub = time_blocks.user_sub
         AND clients.id = time_blocks.client_id
        LEFT JOIN user_settings
          ON user_settings.user_sub = time_blocks.user_sub
        WHERE time_blocks.user_sub = $1
          AND time_blocks.id = $2
        "#,
    )
    .bind(user_sub)
    .bind(block_id)
    .bind(DEFAULT_PERSONAL_COLOR)
    .bind(PERSONAL_INITIALS)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(TimeBlockApiError::NotFound("time block not found"))
}

fn validate_time_block_payload(
    payload: TimeBlockPayload,
) -> Result<ValidatedTimeBlock, TimeBlockApiError> {
    let day = parse_day(&payload.day)?;
    let start_time = parse_time(&payload.start_time, "start time")?;
    let end_time = parse_time(&payload.end_time, "end time")?;

    if end_time <= start_time {
        return Err(TimeBlockApiError::BadRequest(
            "end time must be after start time",
        ));
    }

    let title = payload.title.and_then(|title| {
        let trimmed = title.trim().to_owned();
        (!trimmed.is_empty()).then_some(trimmed)
    });

    let category = payload.category.trim().to_ascii_lowercase();
    let client_id = match category.as_str() {
        CATEGORY_PERSONAL => {
            if payload.client_id.is_some() {
                return Err(TimeBlockApiError::BadRequest(
                    "personal time blocks cannot have a client",
                ));
            }
            None
        }
        CATEGORY_CLIENT => Some(payload.client_id.ok_or(TimeBlockApiError::BadRequest(
            "client time blocks require a client",
        ))?),
        _ => {
            return Err(TimeBlockApiError::BadRequest(
                "time block category must be client or personal",
            ));
        }
    };

    Ok(ValidatedTimeBlock {
        day,
        start_time,
        end_time,
        title,
        category,
        client_id,
    })
}

fn parse_day(day: &str) -> Result<NaiveDate, TimeBlockApiError> {
    NaiveDate::parse_from_str(day.trim(), "%Y-%m-%d")
        .map_err(|_| TimeBlockApiError::BadRequest("day must use YYYY-MM-DD"))
}

fn parse_time(time: &str, field_name: &'static str) -> Result<NaiveTime, TimeBlockApiError> {
    let time = time.trim();
    NaiveTime::parse_from_str(time, "%H:%M")
        .or_else(|_| NaiveTime::parse_from_str(time, "%H:%M:%S"))
        .map_err(|_| match field_name {
            "start time" => TimeBlockApiError::BadRequest("start time must use HH:MM"),
            _ => TimeBlockApiError::BadRequest("end time must use HH:MM"),
        })
}

fn map_database_error(error: sqlx::Error) -> TimeBlockApiError {
    match error {
        sqlx::Error::Database(database_error) => match database_error.constraint() {
            Some("time_blocks_client_owner_fk") => TimeBlockApiError::NotFound("client not found"),
            Some("time_blocks_time_order_check") => {
                TimeBlockApiError::BadRequest("end time must be after start time")
            }
            Some("time_blocks_category_check") | Some("time_blocks_assignment_check") => {
                TimeBlockApiError::BadRequest("invalid time block assignment")
            }
            Some("time_blocks_title_not_blank") => {
                TimeBlockApiError::BadRequest("time block title cannot be blank")
            }
            _ if database_error.code().as_deref() == Some("23514") => {
                TimeBlockApiError::BadRequest("invalid time block data")
            }
            _ => {
                tracing::error!("time block database operation failed: {database_error}");
                TimeBlockApiError::Internal
            }
        },
        other_error => {
            tracing::error!("time block database operation failed: {other_error}");
            TimeBlockApiError::Internal
        }
    }
}

impl IntoResponse for TimeBlockApiError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            Self::BadRequest(error) => (StatusCode::BAD_REQUEST, error),
            Self::NotFound(error) => (StatusCode::NOT_FOUND, error),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "time block operation failed",
            ),
        };

        (status, Json(ErrorResponse { error })).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_day, parse_time, validate_time_block_payload, TimeBlock, TimeBlockPayload,
        CATEGORY_CLIENT, CATEGORY_PERSONAL,
    };
    use chrono::{NaiveDate, NaiveTime, Utc};
    use uuid::Uuid;

    #[test]
    fn identifies_time_block_assignment() {
        let day = match NaiveDate::from_ymd_opt(2026, 7, 19) {
            Some(day) => day,
            None => panic!("test date should be valid"),
        };
        let start_time = match NaiveTime::from_hms_opt(9, 0, 0) {
            Some(time) => time,
            None => panic!("test start time should be valid"),
        };
        let end_time = match NaiveTime::from_hms_opt(10, 0, 0) {
            Some(time) => time,
            None => panic!("test end time should be valid"),
        };

        let personal = TimeBlock {
            id: Uuid::nil(),
            user_sub: "user-1".to_owned(),
            day,
            start_time,
            end_time,
            title: None,
            category: CATEGORY_PERSONAL.to_owned(),
            client_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(personal.is_personal());
        assert!(!personal.is_client_block());

        let client_block = TimeBlock {
            category: CATEGORY_CLIENT.to_owned(),
            client_id: Some(Uuid::nil()),
            ..personal
        };

        assert!(!client_block.is_personal());
        assert!(client_block.is_client_block());
    }

    #[test]
    fn validates_personal_time_block_payload() {
        let result = validate_time_block_payload(TimeBlockPayload {
            day: "2026-07-19".to_owned(),
            start_time: "09:00".to_owned(),
            end_time: "10:30".to_owned(),
            title: Some(" Planning ".to_owned()),
            category: "personal".to_owned(),
            client_id: None,
        });

        assert!(result.is_ok());
        match result {
            Ok(block) => {
                assert_eq!(block.category, CATEGORY_PERSONAL);
                assert_eq!(block.client_id, None);
                assert_eq!(block.title, Some("Planning".to_owned()));
            }
            Err(_) => panic!("personal block payload should be valid"),
        }
    }

    #[test]
    fn rejects_invalid_time_order() {
        let result = validate_time_block_payload(TimeBlockPayload {
            day: "2026-07-19".to_owned(),
            start_time: "10:00".to_owned(),
            end_time: "10:00".to_owned(),
            title: None,
            category: "personal".to_owned(),
            client_id: None,
        });

        assert!(result.is_err());
    }

    #[test]
    fn rejects_client_category_without_client_id() {
        let result = validate_time_block_payload(TimeBlockPayload {
            day: "2026-07-19".to_owned(),
            start_time: "09:00".to_owned(),
            end_time: "10:00".to_owned(),
            title: None,
            category: "client".to_owned(),
            client_id: None,
        });

        assert!(result.is_err());
    }

    #[test]
    fn parses_day_and_time_formats() {
        assert!(parse_day("2026-07-19").is_ok());
        assert!(parse_time("09:15", "start time").is_ok());
        assert!(parse_time("09:15:30", "end time").is_ok());
        assert!(parse_day("07-19-2026").is_err());
        assert!(parse_time("9am", "start time").is_err());
    }
}
