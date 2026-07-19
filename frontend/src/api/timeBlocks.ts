import { apiGet } from "./client";
import type { TimeBlockListResponse } from "./types";

export function getTimeBlocks(day: string) {
  return apiGet<TimeBlockListResponse>(
    `/api/time-blocks?day=${encodeURIComponent(day)}`,
  );
}
