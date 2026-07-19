use axum::{
    extract::State,
    http::{header, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use crate::{accounts, auth, config::Config};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: PgPool,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    database: &'static str,
}

#[derive(Serialize)]
struct PublicConfigResponse {
    auth_login_url: String,
    self_url: String,
    database_configured: bool,
    auth_jwks_configured: bool,
}

pub fn build_router(config: Config, db: PgPool) -> Router {
    let state = AppState { config, db };
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::ACCEPT, header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_credentials(true)
        .allow_origin(AllowOrigin::list(cors_allowed_origins(&state.config)));

    let protected_routes = Router::new()
        .route("/api/auth/me", get(accounts::me))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_user,
        ));

    Router::new()
        .route("/api/health", get(health))
        .route("/api/config", get(public_config))
        .route("/api/auth/login", get(auth::login))
        .route("/api/auth/register", post(accounts::register))
        .merge(protected_routes)
        .layer(axum::middleware::from_fn(forwarded_host_vary))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<HealthResponse>) {
    match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => (
            StatusCode::OK,
            Json(HealthResponse {
                status: "ok",
                database: "connected",
            }),
        ),
        Err(err) => {
            tracing::error!("database health check failed: {err}");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(HealthResponse {
                    status: "degraded",
                    database: "unavailable",
                }),
            )
        }
    }
}

async fn public_config(State(state): State<AppState>) -> Json<PublicConfigResponse> {
    Json(PublicConfigResponse {
        auth_login_url: auth::login_url(&state.config),
        self_url: state.config.self_url.clone(),
        database_configured: state.config.database_configured(),
        auth_jwks_configured: state.config.auth_jwks_configured(),
    })
}

async fn forwarded_host_vary(request: axum::extract::Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().append(
        header::VARY,
        HeaderValue::from_static("Origin, X-Forwarded-Host, X-Forwarded-Proto"),
    );
    response
}

fn cors_allowed_origins(config: &Config) -> Vec<HeaderValue> {
    let mut origins = vec![config.self_url.as_str(), "http://localhost:5173"];

    if let Some(origin) = config.allowed_cors_origin.as_deref() {
        origins.push(origin);
    }

    origins
        .into_iter()
        .filter_map(|origin| HeaderValue::from_str(origin.trim_end_matches('/')).ok())
        .collect()
}
