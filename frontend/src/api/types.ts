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

export interface Client {
  id: string;
  user_sub: string;
  name: string;
  initials: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface ClientPayload {
  name: string;
  initials: string;
  color: string;
}

export interface ClientListResponse {
  clients: Client[];
  personal_color: string;
}

export interface ClientResponse {
  client: Client;
}

export interface UserSettings {
  user_sub: string;
  personal_color: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsResponse {
  settings: UserSettings;
}

export interface TimeBlock {
  id: string;
  user_sub: string;
  day: string;
  start_time: string;
  end_time: string;
  title: string | null;
  category: "client" | "personal";
  client_id: string | null;
  color: string;
  initials: string;
  client_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeBlockListResponse {
  blocks: TimeBlock[];
}
