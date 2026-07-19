use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

pub const CATEGORY_CLIENT: &str = "client";
pub const CATEGORY_PERSONAL: &str = "personal";
pub const PERSONAL_INITIALS: &str = "P";

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

#[cfg(test)]
mod tests {
    use super::{TimeBlock, CATEGORY_CLIENT, CATEGORY_PERSONAL};
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
}
