import { useEffect, useMemo, useState, type PointerEvent } from "react";

import { ApiError } from "../api/client";
import { getClients } from "../api/clients";
import { createTimeBlock, getTimeBlocks } from "../api/timeBlocks";
import type { Client, TimeBlock, TimeBlockPayload } from "../api/types";

const HOUR_HEIGHT_PX = 72;
const DAY_MINUTES = 24 * 60;
const SNAP_MINUTES = 15;

interface DraftBlock {
  assignment: string;
  endMinute: number;
  isSelecting: boolean;
  startMinute: number;
  title: string;
}

export function DayTimeline() {
  const day = useMemo(() => todayDate(), []);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<DraftBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pointerId, setPointerId] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTimelineData() {
      setIsLoading(true);
      setError(null);

      try {
        const [blockResponse, clientResponse] = await Promise.all([
          getTimeBlocks(day),
          getClients(),
        ]);
        if (!isMounted) {
          return;
        }
        setBlocks(blockResponse.blocks);
        setClients(clientResponse.clients);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(errorMessage(loadError, "Unable to load time blocks."));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadTimelineData();

    return () => {
      isMounted = false;
    };
  }, [day]);

  const sortedBlocks = useMemo(
    () =>
      [...blocks].sort(
        (first, second) =>
          minutesFromTime(first.start_time) -
          minutesFromTime(second.start_time),
      ),
    [blocks],
  );

  function handleTimelinePointerDown(
    event: PointerEvent<HTMLDivElement>,
  ): void {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("[data-time-block]")
    ) {
      return;
    }

    const minute = minuteFromPointer(event.currentTarget, event.clientY);
    setPointerId(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({
      assignment: "personal",
      endMinute: clamp(minute + 60, minute + SNAP_MINUTES, DAY_MINUTES),
      isSelecting: true,
      startMinute: minute,
      title: "",
    });
  }

  function handleTimelinePointerMove(
    event: PointerEvent<HTMLDivElement>,
  ): void {
    if (pointerId !== event.pointerId) {
      return;
    }

    const minute = minuteFromPointer(event.currentTarget, event.clientY, true);
    setDraft((current) =>
      current?.isSelecting ? { ...current, endMinute: minute } : current,
    );
  }

  function handleTimelinePointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPointerId(null);
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const range = normalizedDraftRange(current);
      return {
        ...current,
        endMinute: range.endMinute,
        isSelecting: false,
        startMinute: range.startMinute,
      };
    });
  }

  async function handleCreateDraft() {
    if (!draft) {
      return;
    }

    const payload = payloadFromDraft(day, draft);
    if (!payload) {
      setError("Choose a client or Personal.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await createTimeBlock(payload);
      setBlocks((current) => [...current, response.block].sort(sortBlocks));
      setDraft(null);
    } catch (createError) {
      setError(errorMessage(createError, "Unable to add time block."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Day view
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            {formatDateLabel(day)}
          </h2>
        </div>
        <div className="text-sm font-medium text-slate-600">
          {isLoading ? "Loading" : `${blocks.length} blocks`}
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      {draft && !draft.isSelecting ? (
        <QuickCreateForm
          clients={clients}
          draft={draft}
          isSaving={isSaving}
          onCancel={() => setDraft(null)}
          onChange={setDraft}
          onSave={() => void handleCreateDraft()}
        />
      ) : null}

      <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[72px_minmax(0,1fr)]">
          <div className="border-r border-slate-200 bg-slate-50">
            {HOURS.map((hour) => (
              <div
                className="flex items-start justify-end px-3 pt-2 text-xs font-bold uppercase text-slate-500"
                key={hour}
                style={{ height: HOUR_HEIGHT_PX }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          <div
            className="relative cursor-crosshair bg-white"
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerCancel={handleTimelinePointerUp}
            onPointerUp={handleTimelinePointerUp}
            style={{ height: HOUR_HEIGHT_PX * 24 }}
          >
            {HOURS.map((hour) => (
              <div
                className="absolute left-0 right-0 border-t border-slate-200"
                key={hour}
                style={{ top: hour * HOUR_HEIGHT_PX }}
              />
            ))}
            {HALF_HOURS.map((minute) => (
              <div
                className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                key={minute}
                style={{ top: (minute / 60) * HOUR_HEIGHT_PX }}
              />
            ))}

            {draft ? <DraftOverlay draft={draft} /> : null}
            {sortedBlocks.map((block) => (
              <TimelineBlock block={block} key={block.id} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickCreateForm({
  clients,
  draft,
  isSaving,
  onCancel,
  onChange,
  onSave,
}: {
  clients: Client[];
  draft: DraftBlock;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (draft: DraftBlock) => void;
  onSave: () => void;
}) {
  const range = normalizedDraftRange(draft);

  return (
    <div className="mt-5 grid gap-4 rounded-md border border-emerald-200 bg-white p-4 shadow-sm md:grid-cols-[160px_minmax(0,1fr)_minmax(180px,220px)_auto] md:items-end">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          Time
        </div>
        <div className="mt-2 text-sm font-bold text-slate-950">
          {minuteLabel(range.startMinute)} - {minuteLabel(range.endMinute)}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          Title
        </span>
        <input
          className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
          type="text"
          value={draft.title}
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          Category
        </span>
        <select
          className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          onChange={(event) =>
            onChange({ ...draft, assignment: event.target.value })
          }
          value={draft.assignment}
        >
          <option value="personal">Personal</option>
          {clients.map((client) => (
            <option key={client.id} value={`client:${client.id}`}>
              {client.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <button
          className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSaving}
          onClick={onSave}
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function DraftOverlay({ draft }: { draft: DraftBlock }) {
  const range = normalizedDraftRange(draft);
  const top = (range.startMinute / 60) * HOUR_HEIGHT_PX;
  const height = ((range.endMinute - range.startMinute) / 60) * HOUR_HEIGHT_PX;

  return (
    <div
      className="pointer-events-none absolute left-3 right-3 rounded-md border-2 border-dashed border-emerald-500 bg-emerald-100/70"
      style={{ top, height }}
    />
  );
}

function TimelineBlock({ block }: { block: TimeBlock }) {
  const startMinutes = clamp(minutesFromTime(block.start_time), 0, DAY_MINUTES);
  const endMinutes = clamp(minutesFromTime(block.end_time), 0, DAY_MINUTES);
  const durationMinutes = Math.max(endMinutes - startMinutes, 1);
  const top = (startMinutes / 60) * HOUR_HEIGHT_PX;
  const height = (durationMinutes / 60) * HOUR_HEIGHT_PX;
  const compact = height < 42;
  const title = block.title ?? block.client_name ?? labelForCategory(block);

  return (
    <article
      data-time-block="true"
      className="absolute left-3 right-3 overflow-hidden rounded-md border border-black/10 px-3 py-2 shadow-sm"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        top,
        height,
        backgroundColor: block.color,
        color: readableTextColor(block.color),
      }}
    >
      <div className="flex h-full min-w-0 items-center gap-3">
        <div className="grid h-9 w-11 shrink-0 place-items-center rounded-md bg-white/20 px-2 text-sm font-black">
          {block.initials.slice(0, 4)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{title}</div>
          {!compact ? (
            <div className="mt-1 truncate text-xs font-semibold opacity-85">
              {formatTime(block.start_time)} - {formatTime(block.end_time)}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HALF_HOURS = Array.from({ length: 24 }, (_, hour) => hour * 60 + 30);

function todayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date);

  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(value);
}

function formatHour(hour: number) {
  if (hour === 0) {
    return "12 AM";
  }
  if (hour === 12) {
    return "12 PM";
  }
  return `${hour > 12 ? hour - 12 : hour} ${hour > 12 ? "PM" : "AM"}`;
}

function formatTime(time: string) {
  const minutes = minutesFromTime(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function minutesFromTime(time: string) {
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

function sortBlocks(first: TimeBlock, second: TimeBlock) {
  return minutesFromTime(first.start_time) - minutesFromTime(second.start_time);
}

function minuteFromPointer(
  element: HTMLDivElement,
  clientY: number,
  allowDayEnd = false,
) {
  const rect = element.getBoundingClientRect();
  const y = clamp(clientY - rect.top, 0, rect.height);
  const minute = Math.floor((y / HOUR_HEIGHT_PX) * 60);
  const maxMinute = allowDayEnd ? DAY_MINUTES : DAY_MINUTES - SNAP_MINUTES;

  return clamp(Math.floor(minute / SNAP_MINUTES) * SNAP_MINUTES, 0, maxMinute);
}

function normalizedDraftRange(draft: DraftBlock) {
  const startMinute = Math.min(draft.startMinute, draft.endMinute);
  let endMinute = Math.max(draft.startMinute, draft.endMinute);

  if (endMinute - startMinute < SNAP_MINUTES) {
    endMinute = clamp(
      startMinute + 60,
      startMinute + SNAP_MINUTES,
      DAY_MINUTES,
    );
  }

  return { endMinute, startMinute };
}

function payloadFromDraft(
  day: string,
  draft: DraftBlock,
): TimeBlockPayload | null {
  const range = normalizedDraftRange(draft);
  const title = draft.title.trim();

  if (draft.assignment === "personal") {
    return {
      category: "personal",
      client_id: null,
      day,
      end_time: timeValue(range.endMinute),
      start_time: timeValue(range.startMinute),
      title: title || null,
    };
  }

  const clientId = draft.assignment.startsWith("client:")
    ? draft.assignment.slice("client:".length)
    : "";

  if (!clientId) {
    return null;
  }

  return {
    category: "client",
    client_id: clientId,
    day,
    end_time: timeValue(range.endMinute),
    start_time: timeValue(range.startMinute),
    title: title || null,
  };
}

function timeValue(minuteOfDay: number) {
  if (minuteOfDay >= DAY_MINUTES) {
    return "23:59";
  }

  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minuteLabel(minuteOfDay: number) {
  return formatTime(timeValue(minuteOfDay));
}

function labelForCategory(block: TimeBlock) {
  return block.category === "personal" ? "Personal" : "Client";
}

function validHexColor(color: string) {
  return /^#[0-9a-fA-F]{6}$/.test(color.trim());
}

function readableTextColor(color: string) {
  if (!validHexColor(color)) {
    return "#FFFFFF";
  }

  const hex = color.slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.62 ? "#0F172A" : "#FFFFFF";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
