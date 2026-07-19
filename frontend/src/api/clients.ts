import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type {
  ClientListResponse,
  ClientPayload,
  ClientResponse,
  UserSettingsResponse,
} from "./types";

export function getClients() {
  return apiGet<ClientListResponse>("/api/clients");
}

export function createClient(payload: ClientPayload) {
  return apiPost<ClientResponse>("/api/clients", payload);
}

export function updateClient(clientId: string, payload: ClientPayload) {
  return apiPatch<ClientResponse>(
    `/api/clients/${encodeURIComponent(clientId)}`,
    payload,
  );
}

export function deleteClient(clientId: string) {
  return apiDelete(`/api/clients/${encodeURIComponent(clientId)}`);
}

export function updatePersonalColor(personal_color: string) {
  return apiPatch<UserSettingsResponse>("/api/clients/personal-color", {
    personal_color,
  });
}
