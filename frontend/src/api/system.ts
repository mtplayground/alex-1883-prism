import { apiGet, apiPost } from "./client";
import type {
  AuthUserResponse,
  HealthResponse,
  PublicConfigResponse,
} from "./types";

export function getHealth() {
  return apiGet<HealthResponse>("/api/health");
}

export function getPublicConfig() {
  return apiGet<PublicConfigResponse>("/api/config");
}

export function getCurrentUser() {
  return apiGet<AuthUserResponse>("/api/auth/me");
}

export function registerCurrentUser() {
  return apiPost<AuthUserResponse>("/api/auth/register");
}
