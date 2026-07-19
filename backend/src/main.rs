mod accounts;
mod auth;
mod clients;
mod config;
mod db;
mod http;
pub mod time_blocks;

use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{config::Config, db::connect_and_migrate, http::build_router};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();

    let config = Config::from_env()?;
    let address = config.socket_addr()?;
    let db = connect_and_migrate(&config).await?;
    let router = build_router(config, db);
    let listener = TcpListener::bind(address).await?;

    tracing::info!("backend listening on http://{address}");

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

fn init_tracing() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "alex_1883_prism_backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
}

async fn shutdown_signal() {
    if let Err(err) = tokio::signal::ctrl_c().await {
        tracing::warn!("failed to listen for shutdown signal: {err}");
    }
}
