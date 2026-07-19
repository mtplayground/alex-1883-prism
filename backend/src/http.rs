use axum::{
    extract::State,
    http::{header, request::Parts, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, Response},
    routing::{any, get, post},
    Json, Router,
};
use serde::Serialize;
use sqlx::PgPool;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    services::ServeDir,
    trace::TraceLayer,
};

use crate::{accounts, auth, clients, config::Config, time_blocks};

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
    let frontend_dist =
        std::env::var("FRONTEND_DIST_DIR").unwrap_or_else(|_| "frontend/dist".to_owned());
    let assets = ServeDir::new(format!("{frontend_dist}/assets"));
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::ACCEPT, header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_credentials(true)
        .allow_origin(cors_allowed_origin(&state.config));

    let protected_routes = Router::new()
        .route("/api/auth/me", get(accounts::me))
        .merge(clients::routes())
        .merge(time_blocks::routes())
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
        .route("/api/*path", any(api_not_found))
        .nest_service("/assets", assets)
        .fallback(get(spa_index))
        .layer(axum::middleware::from_fn(forwarded_host_vary))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn api_not_found() -> StatusCode {
    StatusCode::NOT_FOUND
}

async fn spa_index() -> Result<Html<String>, StatusCode> {
    let frontend_dist =
        std::env::var("FRONTEND_DIST_DIR").unwrap_or_else(|_| "frontend/dist".to_owned());
    std::fs::read_to_string(format!("{frontend_dist}/index.html"))
        .map(Html)
        .map_err(|err| {
            tracing::error!("failed to read frontend index.html: {err}");
            StatusCode::NOT_FOUND
        })
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

fn cors_allowed_origin(config: &Config) -> AllowOrigin {
    let configured_hosts = configured_origin_hosts(config);

    AllowOrigin::predicate(move |origin, parts| {
        origin
            .to_str()
            .ok()
            .and_then(origin_host)
            .is_some_and(|origin_host| {
                forwarded_public_host(parts)
                    .is_some_and(|public_host| public_host.eq_ignore_ascii_case(&origin_host))
                    || configured_hosts
                        .iter()
                        .any(|configured_host| configured_host.eq_ignore_ascii_case(&origin_host))
            })
    })
}

fn configured_origin_hosts(config: &Config) -> Vec<String> {
    let mut origins = vec![config.self_url.as_str(), "http://localhost:5173"];

    if let Some(origin) = config.allowed_cors_origin.as_deref() {
        origins.extend(origin.split(','));
    }

    origins.into_iter().filter_map(origin_host).collect()
}

fn origin_host(origin: &str) -> Option<String> {
    let origin = origin.trim().trim_end_matches('/');
    let without_scheme = origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"))
        .unwrap_or(origin);
    let host = without_scheme.split('/').next()?.trim().to_ascii_lowercase();

    (!host.is_empty()).then_some(strip_port(&host))
}

fn forwarded_public_host(parts: &Parts) -> Option<String> {
    let host = parts
        .headers
        .get("x-forwarded-host")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            parts
                .headers
                .get(header::HOST)
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })?;

    Some(strip_port(&host.to_ascii_lowercase()))
}

fn strip_port(host: &str) -> String {
    match host.rsplit_once(':') {
        Some((hostname, port)) if port.chars().all(|character| character.is_ascii_digit()) => {
            hostname.to_owned()
        }
        _ => host.to_owned(),
    }
}
