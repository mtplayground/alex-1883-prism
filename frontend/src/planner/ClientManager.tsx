import { useEffect, useMemo, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import {
  createClient,
  deleteClient,
  getClients,
  updateClient,
  updatePersonalColor,
} from "../api/clients";
import type { Client, ClientPayload } from "../api/types";

const DEFAULT_CLIENT_COLOR = "#0F766E";
const DEFAULT_PERSONAL_COLOR = "#64748B";

type SaveState = "idle" | "saving";

interface ClientDraft {
  name: string;
  initials: string;
  color: string;
}

const emptyDraft: ClientDraft = {
  name: "",
  initials: "",
  color: DEFAULT_CLIENT_COLOR,
};

export function ClientManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<ClientDraft>(emptyDraft);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ClientDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [personalColor, setPersonalColor] = useState(DEFAULT_PERSONAL_COLOR);
  const [personalDraft, setPersonalDraft] = useState(DEFAULT_PERSONAL_COLOR);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getClients();
        if (!isMounted) {
          return;
        }

        setClients(response.clients);
        setPersonalColor(response.personal_color);
        setPersonalDraft(response.personal_color);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }
        setError(errorMessage(loadError, "Unable to load clients."));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadClients();

    return () => {
      isMounted = false;
    };
  }, []);

  const previewClients = useMemo(() => {
    const visibleClients = clients.slice(0, 3);
    if (visibleClients.length > 0) {
      return visibleClients;
    }

    return [
      {
        id: "preview",
        user_sub: "",
        name: "Client",
        initials: draft.initials.trim() || "CL",
        color: validHexColor(draft.color) ? draft.color : DEFAULT_CLIENT_COLOR,
        created_at: "",
        updated_at: "",
      },
    ];
  }, [clients, draft.color, draft.initials]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = toPayload(draft);
    if (!payload) {
      setError("Name, initials, and a hex color are required.");
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      const response = await createClient(payload);
      setClients((current) => [...current, response.client].sort(sortClients));
      setDraft(emptyDraft);
    } catch (createError) {
      setError(errorMessage(createError, "Unable to add client."));
    } finally {
      setSaveState("idle");
    }
  }

  function startEditing(client: Client) {
    setEditingClientId(client.id);
    setEditDraft({
      name: client.name,
      initials: client.initials,
      color: client.color,
    });
    setError(null);
  }

  function cancelEditing() {
    setEditingClientId(null);
    setEditDraft(emptyDraft);
  }

  async function handleEdit(
    event: FormEvent<HTMLFormElement>,
    clientId: string,
  ) {
    event.preventDefault();
    const payload = toPayload(editDraft);
    if (!payload) {
      setError("Name, initials, and a hex color are required.");
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      const response = await updateClient(clientId, payload);
      setClients((current) =>
        current
          .map((client) =>
            client.id === response.client.id ? response.client : client,
          )
          .sort(sortClients),
      );
      cancelEditing();
    } catch (updateError) {
      setError(errorMessage(updateError, "Unable to update client."));
    } finally {
      setSaveState("idle");
    }
  }

  async function handleDelete(client: Client) {
    if (!window.confirm(`Remove ${client.name}?`)) {
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      await deleteClient(client.id);
      setClients((current) =>
        current.filter((candidate) => candidate.id !== client.id),
      );
      if (editingClientId === client.id) {
        cancelEditing();
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError, "Unable to remove client."));
    } finally {
      setSaveState("idle");
    }
  }

  async function handlePersonalColor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validHexColor(personalDraft)) {
      setError("Personal color must be a hex color.");
      return;
    }

    setSaveState("saving");
    setError(null);

    try {
      const response = await updatePersonalColor(personalDraft);
      setPersonalColor(response.settings.personal_color);
      setPersonalDraft(response.settings.personal_color);
    } catch (personalError) {
      setError(errorMessage(personalError, "Unable to update personal color."));
    } finally {
      setSaveState("idle");
    }
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Clients
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
              Client manager
            </h2>
          </div>
          <div className="text-sm font-medium text-slate-600">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_120px_152px_auto]"
          onSubmit={handleCreate}
        >
          <TextField
            label="Name"
            onChange={(name) => setDraft((current) => ({ ...current, name }))}
            value={draft.name}
          />
          <TextField
            label="Initials"
            maxLength={4}
            onChange={(initials) =>
              setDraft((current) => ({ ...current, initials }))
            }
            value={draft.initials}
          />
          <ColorField
            label="Color"
            onChange={(color) => setDraft((current) => ({ ...current, color }))}
            value={draft.color}
          />
          <button
            className="min-h-11 self-end rounded-md bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={saveState === "saving"}
            type="submit"
          >
            Add
          </button>
        </form>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="rounded-md border border-slate-200 bg-white px-4 py-5 text-sm font-medium text-slate-600">
              Loading clients
            </div>
          ) : clients.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-medium text-slate-600">
              No clients yet
            </div>
          ) : (
            clients.map((client) =>
              editingClientId === client.id ? (
                <form
                  className="rounded-md border border-emerald-200 bg-white p-4 shadow-sm"
                  key={client.id}
                  onSubmit={(event) => void handleEdit(event, client.id)}
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_152px]">
                    <TextField
                      label="Name"
                      onChange={(name) =>
                        setEditDraft((current) => ({ ...current, name }))
                      }
                      value={editDraft.name}
                    />
                    <TextField
                      label="Initials"
                      maxLength={4}
                      onChange={(initials) =>
                        setEditDraft((current) => ({ ...current, initials }))
                      }
                      value={editDraft.initials}
                    />
                    <ColorField
                      label="Color"
                      onChange={(color) =>
                        setEditDraft((current) => ({ ...current, color }))
                      }
                      value={editDraft.color}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      onClick={cancelEditing}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="min-h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={saveState === "saving"}
                      type="submit"
                    >
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <ClientRow
                  client={client}
                  isBusy={saveState === "saving"}
                  key={client.id}
                  onDelete={() => void handleDelete(client)}
                  onEdit={() => startEditing(client)}
                />
              ),
            )
          )}
        </div>
      </div>

      <aside className="space-y-5">
        <form
          className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={handlePersonalColor}
        >
          <ColorField
            label="Personal"
            onChange={setPersonalDraft}
            value={personalDraft}
          />
          <SwatchPreview
            className="mt-4"
            color={validHexColor(personalDraft) ? personalDraft : personalColor}
            initials="P"
            label="Personal"
          />
          <button
            className="mt-4 min-h-10 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={saveState === "saving"}
            type="submit"
          >
            Save personal color
          </button>
        </form>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-950">
            Planner preview
          </div>
          <div className="space-y-3">
            <SwatchPreview
              color={personalColor}
              initials="P"
              label="Personal"
            />
            {previewClients.map((client) => (
              <SwatchPreview
                color={client.color}
                initials={client.initials}
                key={client.id}
                label={client.name}
              />
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}

function ClientRow({
  client,
  isBusy,
  onDelete,
  onEdit,
}: {
  client: Client;
  isBusy: boolean;
  onDelete: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="grid gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[64px_minmax(0,1fr)_auto] md:items-center">
      <Swatch color={client.color} initials={client.initials} />
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-slate-950">
          {client.name}
        </div>
        <div className="mt-1 font-mono text-sm text-slate-600">
          {client.color}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <button
          className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          disabled={isBusy}
          onClick={onEdit}
          type="button"
        >
          Edit
        </button>
        <button
          className="min-h-10 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          disabled={isBusy}
          onClick={onDelete}
          type="button"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  maxLength,
  onChange,
  value,
}: {
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        {label}
      </span>
      <input
        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={value}
      />
    </label>
  );
}

function ColorField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        {label}
      </span>
      <div className="mt-2 grid min-h-11 grid-cols-[44px_minmax(0,1fr)] overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
        <input
          aria-label={`${label} picker`}
          className="h-full w-full cursor-pointer border-0 bg-transparent p-1"
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={validHexColor(value) ? value : DEFAULT_CLIENT_COLOR}
        />
        <input
          aria-label={`${label} hex`}
          className="min-w-0 border-0 px-3 font-mono text-sm text-slate-950 outline-none"
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
          type="text"
          value={value}
        />
      </div>
    </label>
  );
}

function SwatchPreview({
  className = "",
  color,
  initials,
  label,
}: {
  className?: string;
  color: string;
  initials: string;
  label: string;
}) {
  return (
    <div
      className={`grid min-h-16 grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-md border border-black/10 px-3 py-2 ${className}`}
      style={{
        backgroundColor: color,
        color: readableTextColor(color),
      }}
    >
      <div className="grid h-10 w-10 place-items-center rounded-md bg-white/20 text-sm font-bold">
        {initials.slice(0, 4)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{label}</div>
        <div className="mt-0.5 font-mono text-xs opacity-80">{color}</div>
      </div>
    </div>
  );
}

function Swatch({ color, initials }: { color: string; initials: string }) {
  return (
    <div
      className="grid h-14 w-14 place-items-center rounded-md text-sm font-bold shadow-sm"
      style={{
        backgroundColor: color,
        color: readableTextColor(color),
      }}
    >
      {initials.slice(0, 4)}
    </div>
  );
}

function toPayload(draft: ClientDraft): ClientPayload | null {
  const name = draft.name.trim();
  const initials = draft.initials.trim();
  const color = draft.color.trim();

  if (!name || !initials || !validHexColor(color)) {
    return null;
  }

  return { name, initials, color };
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

function sortClients(first: Client, second: Client) {
  return first.name.localeCompare(second.name, undefined, {
    sensitivity: "base",
  });
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}
