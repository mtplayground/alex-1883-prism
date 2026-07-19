import { apiGet, apiPost } from "./client";
import type {
  TimeBlockListResponse,
  TimeBlockPayload,
  TimeBlockResponse,
} from "./types";

export function getTimeBlocks(day: string) {
  return apiGet<TimeBlockListResponse>(
    `/api/time-blocks?day=${encodeURIComponent(day)}`,
  );
}

export function createTimeBlock(payload: TimeBlockPayload) {
  return apiPost<TimeBlockResponse>("/api/time-blocks", payload);
}
