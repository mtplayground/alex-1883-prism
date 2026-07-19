import { apiGet } from "./client";
import type { HealthResponse, PublicConfigResponse } from "./types";

export function getHealth() {
  return apiGet<HealthResponse>("/api/health");
}

export function getPublicConfig() {
  return apiGet<PublicConfigResponse>("/api/config");
}
