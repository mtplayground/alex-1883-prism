use std::time::Duration;

use sqlx::{postgres::PgPoolOptions, PgPool};

use crate::config::Config;

pub async fn connect_and_migrate(config: &Config) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&config.database_url)
        .await
        .map_err(|err| anyhow::anyhow!("failed to connect to PostgreSQL: {err}"))?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|err| anyhow::anyhow!("failed to run database migrations: {err}"))?;

    Ok(pool)
}
