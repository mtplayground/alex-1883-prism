export interface HealthResponse {
  status: "ok";
}

export interface PublicConfigResponse {
  auth_login_url: string;
  self_url: string;
  database_configured: boolean;
  auth_jwks_configured: boolean;
}
