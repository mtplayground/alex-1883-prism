export interface HealthResponse {
  status: "ok" | "degraded";
  database: "connected" | "unavailable";
}

export interface PublicConfigResponse {
  auth_login_url: string;
  self_url: string;
  database_configured: boolean;
  auth_jwks_configured: boolean;
}

export interface User {
  sub: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface AuthUserResponse {
  user: User;
}
