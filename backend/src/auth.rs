use axum::{
    extract::State,
    http::{header, HeaderMap, Request},
    middleware::Next,
    response::{Redirect, Response},
};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};

use crate::{
    accounts::{self, CurrentUser, UserClaims},
    config::Config,
    http::AppState,
};

#[derive(Debug)]
pub enum AuthError {
    MissingSession,
    InvalidSession,
    VerificationUnavailable,
}

pub async fn verify_session(headers: &HeaderMap, config: &Config) -> Result<UserClaims, AuthError> {
    let token = session_cookie(headers).ok_or(AuthError::MissingSession)?;
    let key = fetch_decoding_key(token, config).await?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[config.mctai_auth_app_token.as_str()]);
    validation.set_issuer(&[config.mctai_auth_url.as_str()]);

    decode::<UserClaims>(token, &key, &validation)
        .map(|data| data.claims)
        .map_err(|err| {
            tracing::warn!("mctai_session verification failed: {err}");
            AuthError::InvalidSession
        })
}

pub async fn login(State(state): State<AppState>) -> Redirect {
    Redirect::temporary(&login_url(&state.config))
}

pub async fn require_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, accounts::AuthResponse> {
    let claims = verify_session(&headers, &state.config)
        .await
        .map_err(|err| accounts::auth_error_response_with_message(err, "sign-in required"))?;

    let user = accounts::upsert_user(&state.db, &claims)
        .await
        .map_err(|err| {
            tracing::error!("failed to upsert authenticated user: {err}");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(accounts::ErrorResponse {
                    error: "authentication failed",
                }),
            )
        })?;

    request.extensions_mut().insert(CurrentUser(user));

    Ok(next.run(request).await)
}

pub fn login_url(config: &Config) -> String {
    let return_to = config.self_url.trim_end_matches('/');
    let return_to_url = format!("{return_to}/");
    let encoded_return_to = urlencoding::encode(&return_to_url);

    format!(
        "{}/login?app_token={}&return_to={}",
        config.mctai_auth_url.trim_end_matches('/'),
        config.mctai_auth_app_token,
        encoded_return_to
    )
}

async fn fetch_decoding_key(token: &str, config: &Config) -> Result<DecodingKey, AuthError> {
    let header = decode_header(token).map_err(|err| {
        tracing::warn!("failed to decode mctai_session header: {err}");
        AuthError::InvalidSession
    })?;
    let kid = header.kid.ok_or_else(|| {
        tracing::warn!("mctai_session header missing kid");
        AuthError::InvalidSession
    })?;

    let jwks = reqwest::get(&config.mctai_auth_jwks_url)
        .await
        .map_err(|err| {
            tracing::error!("failed to fetch auth JWKS: {err}");
            AuthError::VerificationUnavailable
        })?
        .json::<JwkSet>()
        .await
        .map_err(|err| {
            tracing::error!("failed to parse auth JWKS: {err}");
            AuthError::VerificationUnavailable
        })?;

    let jwk = jwks.find(&kid).ok_or_else(|| {
        tracing::warn!("mctai_session kid not found in JWKS");
        AuthError::InvalidSession
    })?;

    DecodingKey::from_jwk(jwk).map_err(|err| {
        tracing::warn!("failed to build decoding key from JWKS: {err}");
        AuthError::InvalidSession
    })
}

fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;

    cookie.split(';').find_map(|pair| {
        let (name, value) = pair.trim().split_once('=')?;
        (name == "mctai_session").then_some(value)
    })
}
