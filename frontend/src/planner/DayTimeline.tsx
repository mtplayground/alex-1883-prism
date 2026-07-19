import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";

import { ApiError } from "../api/client";
import { getClients } from "../api/clients";
import {
  createTimeBlock,
  deleteTimeBlock,
  getTimeBlocks,
  updateTimeBlock,
} from "../api/timeBlocks";
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

interface EditBlockDraft {
  assignment: string;
  title: string;
}

type BlockDragMode = "move" | "resize-end" | "resize-start";

interface ActiveBlockDrag {
  blockId: string;
  endMinute: number;
  mode: BlockDragMode;
  originalEndMinute: number;
  originalStartMinute: number;
  pointerId: number;
  startClientY: number;
  startMinute: number;
}

export function DayTimeline() {
  const [day, setDay] = useState(todayDate);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [activeDrag, setActiveDrag] = useState<ActiveBlockDrag | null>(null);
  const activeDragRef = useRef<ActiveBlockDrag | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<DraftBlock | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditBlockDraft>({
    assignment: "personal",
    title: "",
  });
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

  const editingBlock =
    editingBlockId === null
      ? null
      : (blocks.find((block) => block.id === editingBlockId) ?? null);

  function handleDayChange(nextDay: string) {
    if (!validDateValue(nextDay)) {
      return;
    }

    activeDragRef.current = null;
    setActiveDrag(null);
    setBlocks([]);
    setDraft(null);
    setEditingBlockId(null);
    setError(null);
    setPointerId(null);
    setDay(nextDay);
  }

  const commitBlockDrag = useCallback(
    async (drag: ActiveBlockDrag) => {
      const block = blocks.find((candidate) => candidate.id === drag.blockId);
      if (!block) {
        setActiveDrag(null);
        return;
      }

      const unchanged =
        drag.startMinute === drag.originalStartMinute &&
        drag.endMinute === drag.originalEndMinute;
      if (unchanged) {
        if (drag.mode === "move") {
          setEditDraft(blockToEditDraft(block));
          setEditingBlockId(block.id);
        }
        setActiveDrag(null);
        return;
      }

      const payload = payloadFromBlock(
        day,
        block,
        drag.startMinute,
        drag.endMinute,
      );
      setIsSaving(true);
      setError(null);

      try {
        const response = await updateTimeBlock(block.id, payload);
        setBlocks((current) =>
          current
            .map((candidate) =>
              candidate.id === response.block.id ? response.block : candidate,
            )
            .sort(sortBlocks),
        );
        setEditingBlockId((current) =>
          current === response.block.id ? response.block.id : current,
        );
      } catch (updateError) {
        setError(errorMessage(updateError, "Unable to update time block."));
      } finally {
        setActiveDrag(null);
        setIsSaving(false);
      }
    },
    [blocks, day],
  );

  useEffect(() => {
    activeDragRef.current = activeDrag;

    if (!activeDrag) {
      return;
    }

    function handleWindowPointerMove(event: globalThis.PointerEvent) {
      setActiveDrag((current) => {
        if (!current || current.pointerId !== event.pointerId) {
          return current;
        }

        const deltaMinutes = snapDeltaMinutes(
          ((event.clientY - current.startClientY) / HOUR_HEIGHT_PX) * 60,
        );
        const nextRange = rangeForDrag(current, deltaMinutes);

        const nextDrag = {
          ...current,
          endMinute: nextRange.endMinute,
          startMinute: nextRange.startMinute,
        };
        activeDragRef.current = nextDrag;

        return nextDrag;
      });
    }

    function handleWindowPointerUp(event: globalThis.PointerEvent) {
      const currentDrag = activeDragRef.current;
      if (currentDrag?.pointerId === event.pointerId) {
        void commitBlockDrag(currentDrag);
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [activeDrag, commitBlockDrag]);

  function handleTimelinePointerDown(
    event: PointerEvent<HTMLDivElement>,
  ): void {
    if (
      activeDrag ||
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

  function handleBlockDragStart(
    block: TimeBlock,
    mode: BlockDragMode,
    event: PointerEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startMinute = clamp(
      minutesFromTime(block.start_time),
      0,
      DAY_MINUTES,
    );
    const endMinute = clamp(minutesFromTime(block.end_time), 0, DAY_MINUTES);

    setDraft(null);
    setEditingBlockId(null);
    setError(null);
    setActiveDrag({
      blockId: block.id,
      endMinute,
      mode,
      originalEndMinute: endMinute,
      originalStartMinute: startMinute,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startMinute,
    });
  }

  function handleEditBlock(block: TimeBlock) {
    setDraft(null);
    setEditDraft(blockToEditDraft(block));
    setEditingBlockId(block.id);
    setError(null);
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
      handleEditBlock(response.block);
    } catch (createError) {
      setError(errorMessage(createError, "Unable to add time block."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBlock) {
      return;
    }

    const payload = payloadFromEdit(day, editingBlock, editDraft);
    if (!payload) {
      setError("Choose a client or Personal.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await updateTimeBlock(editingBlock.id, payload);
      setBlocks((current) =>
        current
          .map((block) =>
            block.id === response.block.id ? response.block : block,
          )
          .sort(sortBlocks),
      );
      setEditDraft(blockToEditDraft(response.block));
      setEditingBlockId(response.block.id);
    } catch (updateError) {
      setError(errorMessage(updateError, "Unable to update time block."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBlock(block: TimeBlock) {
    if (!window.confirm(`Remove ${blockTitle(block)}?`)) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await deleteTimeBlock(block.id);
      setBlocks((current) =>
        current.filter((candidate) => candidate.id !== block.id),
      );
      setEditingBlockId(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError, "Unable to remove time block."));
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
        <DayNavigation
          blockCount={blocks.length}
          day={day}
          isLoading={isLoading}
          onChangeDay={handleDayChange}
        />
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

      {editingBlock ? (
        <EditBlockForm
          block={editingBlock}
          clients={clients}
          draft={editDraft}
          isSaving={isSaving}
          onCancel={() => setEditingBlockId(null)}
          onChange={setEditDraft}
          onDelete={() => void handleDeleteBlock(editingBlock)}
          onSubmit={(event) => void handleUpdateBlock(event)}
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
              <TimelineBlock
                block={block}
                dragRange={
                  activeDrag?.blockId === block.id
                    ? {
                        endMinute: activeDrag.endMinute,
                        startMinute: activeDrag.startMinute,
                      }
                    : null
                }
                isSaving={isSaving && activeDrag?.blockId === block.id}
                key={block.id}
                onOpen={handleEditBlock}
                onDragStart={handleBlockDragStart}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DayNavigation({
  blockCount,
  day,
  isLoading,
  onChangeDay,
}: {
  blockCount: number;
  day: string;
  isLoading: boolean;
  onChangeDay: (day: string) => void;
}) {
  const today = todayDate();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        onClick={() => onChangeDay(shiftDate(day, -1))}
        type="button"
      >
        Previous
      </button>
      <label className="block">
        <span className="sr-only">Planner date</span>
        <input
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          onChange={(event) => onChangeDay(event.target.value)}
          type="date"
          value={day}
        />
      </label>
      <button
        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        onClick={() => onChangeDay(shiftDate(day, 1))}
        type="button"
      >
        Next
      </button>
      <button
        className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={day === today}
        onClick={() => onChangeDay(today)}
        type="button"
      >
        Today
      </button>
      <div className="min-w-20 text-right text-sm font-medium text-slate-600">
        {isLoading ? "Loading" : `${blockCount} blocks`}
      </div>
    </div>
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

function EditBlockForm({
  block,
  clients,
  draft,
  isSaving,
  onCancel,
  onChange,
  onDelete,
  onSubmit,
}: {
  block: TimeBlock;
  clients: Client[];
  draft: EditBlockDraft;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (draft: EditBlockDraft) => void;
  onDelete: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const startMinute = minutesFromTime(block.start_time);
  const endMinute = minutesFromTime(block.end_time);

  return (
    <form
      className="mt-5 grid gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[160px_minmax(0,1fr)_minmax(180px,220px)_auto] md:items-end"
      onSubmit={onSubmit}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
          Edit block
        </div>
        <div className="mt-2 text-sm font-bold text-slate-950">
          {minuteLabel(startMinute)} - {minuteLabel(endMinute)}
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

      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-11 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          disabled={isSaving}
          onClick={onDelete}
          type="button"
        >
          Delete
        </button>
        <button
          className="min-h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSaving}
          type="submit"
        >
          Save
        </button>
      </div>
    </form>
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

function TimelineBlock({
  block,
  dragRange,
  isSaving,
  onDragStart,
  onOpen,
}: {
  block: TimeBlock;
  dragRange: { endMinute: number; startMinute: number } | null;
  isSaving: boolean;
  onDragStart: (
    block: TimeBlock,
    mode: BlockDragMode,
    event: PointerEvent<HTMLElement>,
  ) => void;
  onOpen: (block: TimeBlock) => void;
}) {
  const startMinutes =
    dragRange?.startMinute ??
    clamp(minutesFromTime(block.start_time), 0, DAY_MINUTES);
  const endMinutes =
    dragRange?.endMinute ??
    clamp(minutesFromTime(block.end_time), 0, DAY_MINUTES);
  const durationMinutes = Math.max(endMinutes - startMinutes, 1);
  const top = (startMinutes / 60) * HOUR_HEIGHT_PX;
  const height = (durationMinutes / 60) * HOUR_HEIGHT_PX;
  const compact = height < 42;
  const title = block.title ?? block.client_name ?? labelForCategory(block);

  return (
    <article
      data-time-block="true"
      className={`absolute left-3 right-3 overflow-hidden rounded-md border border-black/10 px-3 py-2 shadow-sm ${
        isSaving ? "opacity-80" : ""
      }`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(block);
        }
      }}
      onPointerDown={(event) => onDragStart(block, "move", event)}
      role="button"
      style={{
        top,
        height,
        backgroundColor: block.color,
        color: readableTextColor(block.color),
      }}
      tabIndex={0}
    >
      <div className="flex h-full min-w-0 items-center gap-3">
        <div className="grid h-9 w-11 shrink-0 place-items-center rounded-md bg-white/20 px-2 text-sm font-black">
          {block.initials.slice(0, 4)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{title}</div>
          {!compact ? (
            <div className="mt-1 truncate text-xs font-semibold opacity-85">
              {minuteLabel(startMinutes)} - {minuteLabel(endMinutes)}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="absolute inset-x-0 top-0 h-2 cursor-ns-resize"
        onPointerDown={(event) => onDragStart(block, "resize-start", event)}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
        onPointerDown={(event) => onDragStart(block, "resize-end", event)}
      />
    </article>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HALF_HOURS = Array.from({ length: 24 }, (_, hour) => hour * 60 + 30);

function todayDate() {
  return dateValue(new Date());
}

function shiftDate(day: string, dayOffset: number) {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date);
  value.setDate(value.getDate() + dayOffset);

  return dateValue(value);
}

function dateValue(date: Date) {
  const now = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (Number.isNaN(date.getTime())) {
    return dateValue(now);
  }

  return `${year}-${month}-${day}`;
}

function validDateValue(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }

  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date);

  return (
    value.getFullYear() === year &&
    value.getMonth() === month - 1 &&
    value.getDate() === date
  );
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

function snapDeltaMinutes(deltaMinutes: number) {
  return Math.round(deltaMinutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function rangeForDrag(drag: ActiveBlockDrag, deltaMinutes: number) {
  const duration = drag.originalEndMinute - drag.originalStartMinute;

  if (drag.mode === "move") {
    const startMinute = clamp(
      drag.originalStartMinute + deltaMinutes,
      0,
      DAY_MINUTES - duration,
    );

    return {
      endMinute: startMinute + duration,
      startMinute,
    };
  }

  if (drag.mode === "resize-start") {
    return {
      endMinute: drag.originalEndMinute,
      startMinute: clamp(
        drag.originalStartMinute + deltaMinutes,
        0,
        drag.originalEndMinute - SNAP_MINUTES,
      ),
    };
  }

  return {
    endMinute: clamp(
      drag.originalEndMinute + deltaMinutes,
      drag.originalStartMinute + SNAP_MINUTES,
      DAY_MINUTES,
    ),
    startMinute: drag.originalStartMinute,
  };
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

function payloadFromBlock(
  day: string,
  block: TimeBlock,
  startMinute: number,
  endMinute: number,
): TimeBlockPayload {
  return {
    category: block.category,
    client_id: block.client_id,
    day,
    end_time: timeValue(endMinute),
    start_time: timeValue(startMinute),
    title: block.title,
  };
}

function payloadFromEdit(
  day: string,
  block: TimeBlock,
  draft: EditBlockDraft,
): TimeBlockPayload | null {
  const title = draft.title.trim();
  const startMinute = minutesFromTime(block.start_time);
  const endMinute = minutesFromTime(block.end_time);

  if (draft.assignment === "personal") {
    return {
      category: "personal",
      client_id: null,
      day,
      end_time: timeValue(endMinute),
      start_time: timeValue(startMinute),
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
    end_time: timeValue(endMinute),
    start_time: timeValue(startMinute),
    title: title || null,
  };
}

function blockToEditDraft(block: TimeBlock): EditBlockDraft {
  return {
    assignment:
      block.category === "client" && block.client_id
        ? `client:${block.client_id}`
        : "personal",
    title: block.title ?? "",
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

function blockTitle(block: TimeBlock) {
  return block.title ?? block.client_name ?? labelForCategory(block);
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
