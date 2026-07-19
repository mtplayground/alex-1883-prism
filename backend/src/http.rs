use axum::{
    extract::State,
    http::{header, HeaderValue, Method},
    middleware::Next,
    response::Response,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

#[derive(Serialize)]
struct PublicConfigResponse {
    auth_login_url: String,
    self_url: String,
    database_configured: bool,
    auth_jwks_configured: bool,
}

pub fn build_router(config: Config) -> Router {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
        ])
        .allow_credentials(true)
        .allow_origin(AllowOrigin::list(cors_allowed_origins(&config)));

    Router::new()
        .route("/api/health", get(health))
        .route("/api/config", get(public_config))
        .layer(axum::middleware::from_fn(forwarded_host_vary))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(AppState { config })
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

async fn public_config(State(state): State<AppState>) -> Json<PublicConfigResponse> {
    let return_to = state.config.self_url.trim_end_matches('/');
    let return_to_url = format!("{return_to}/");
    let encoded_return_to = urlencoding::encode(&return_to_url);
    let auth_login_url = format!(
        "{}/login?app_token={}&return_to={}",
        state.config.mctai_auth_url.trim_end_matches('/'),
        state.config.mctai_auth_app_token,
        encoded_return_to
    );

    Json(PublicConfigResponse {
        auth_login_url,
        self_url: state.config.self_url,
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
