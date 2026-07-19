use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

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
