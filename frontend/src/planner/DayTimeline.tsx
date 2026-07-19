import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { getTimeBlocks } from "../api/timeBlocks";
import type { TimeBlock } from "../api/types";

const HOUR_HEIGHT_PX = 72;
const DAY_MINUTES = 24 * 60;

export function DayTimeline() {
  const day = useMemo(() => todayDate(), []);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadBlocks() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getTimeBlocks(day);
        if (!isMounted) {
          return;
        }
        setBlocks(response.blocks);
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

    void loadBlocks();

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
            className="relative bg-white"
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

            {sortedBlocks.map((block) => (
              <TimelineBlock block={block} key={block.id} />
            ))}
          </div>
        </div>
      </div>
    </section>
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
      className="absolute left-3 right-3 overflow-hidden rounded-md border border-black/10 px-3 py-2 shadow-sm"
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
