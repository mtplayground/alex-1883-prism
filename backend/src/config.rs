use std::{env, net::SocketAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub database_max_connections: u32,
    pub self_url: String,
    pub mctai_auth_url: String,
    pub mctai_auth_app_token: String,
    pub mctai_auth_jwks_url: String,
    pub allowed_cors_origin: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_owned()),
            port: read_port()?,
            database_url: required_env("DATABASE_URL")?,
            database_max_connections: read_u32("DATABASE_MAX_CONNECTIONS", 5)?,
            self_url: env::var("SELF_URL").unwrap_or_else(|_| "http://localhost:5173".to_owned()),
            mctai_auth_url: env::var("MCTAI_AUTH_URL")
                .unwrap_or_else(|_| "https://auth.mctai.app".to_owned()),
            mctai_auth_app_token: required_env("MCTAI_AUTH_APP_TOKEN")?,
            mctai_auth_jwks_url: env::var("MCTAI_AUTH_JWKS_URL")
                .unwrap_or_else(|_| "https://auth.mctai.app/.well-known/jwks.json".to_owned()),
            allowed_cors_origin: env::var("ALLOWED_CORS_ORIGIN").ok(),
        })
    }

    pub fn socket_addr(&self) -> anyhow::Result<SocketAddr> {
        format!("{}:{}", self.host, self.port)
            .parse()
            .map_err(|err| anyhow::anyhow!("invalid HOST/PORT socket address: {err}"))
    }

    pub fn database_configured(&self) -> bool {
        !self.database_url.trim().is_empty()
    }

    pub fn auth_jwks_configured(&self) -> bool {
        !self.mctai_auth_jwks_url.trim().is_empty()
    }
}

fn read_port() -> anyhow::Result<u16> {
    match env::var("PORT") {
        Ok(value) => value
            .parse()
            .map_err(|err| anyhow::anyhow!("invalid PORT value {value:?}: {err}")),
        Err(_) => Ok(8080),
    }
}

fn read_u32(name: &str, default: u32) -> anyhow::Result<u32> {
    match env::var(name) {
        Ok(value) => value
            .parse()
            .map_err(|err| anyhow::anyhow!("invalid {name} value {value:?}: {err}")),
        Err(_) => Ok(default),
    }
}

fn required_env(name: &str) -> anyhow::Result<String> {
    env::var(name).map_err(|_| anyhow::anyhow!("{name} must be set"))
}
