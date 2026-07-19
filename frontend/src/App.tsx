import { useEffect, useState } from "react";

import { ApiError } from "./api/client";
import { getHealth, getPublicConfig } from "./api/system";
import type { PublicConfigResponse } from "./api/types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; config: PublicConfigResponse; apiStatus: string }
  | { status: "error"; message: string };

export function App() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadShell() {
      try {
        const [config, health] = await Promise.all([
          getPublicConfig(),
          getHealth(),
        ]);

        if (!cancelled) {
          setLoadState({ status: "ready", config, apiStatus: health.status });
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "The API is not reachable from the frontend.",
          });
        }
      }
    }

    void loadShell();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Planner foundation
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal text-slate-950 sm:text-6xl">
            A focused day view for clients and time blocks.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
            The application shell is ready for authentication, client
            management, and the hour-by-hour planner flow described in the
            implementation issues.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <StatusPanel
            label="Frontend"
            value="React + Tailwind"
            tone="neutral"
          />
          <StatusPanel
            label="Backend"
            value={statusText(loadState)}
            tone={statusTone(loadState)}
          />
          <StatusPanel
            label="Storage"
            value="PostgreSQL configured"
            tone="neutral"
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {loadState.status === "ready" ? (
            <a
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              href={loadState.config.auth_login_url}
            >
              Sign in
            </a>
          ) : null}
          <span className="text-sm text-slate-600">
            {loadState.status === "error"
              ? loadState.message
              : "Core features will be added in the follow-up issues."}
          </span>
        </div>
      </section>
    </main>
  );
}

function StatusPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "bad";
}) {
  const color =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "bad"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-md border p-4 shadow-sm ${color}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-base font-semibold">{value}</div>
    </div>
  );
}

function statusText(loadState: LoadState) {
  if (loadState.status === "ready") {
    return `API ${loadState.apiStatus}`;
  }

  if (loadState.status === "error") {
    return "API unavailable";
  }

  return "Checking API";
}

function statusTone(loadState: LoadState): "neutral" | "good" | "bad" {
  if (loadState.status === "ready") {
    return "good";
  }

  if (loadState.status === "error") {
    return "bad";
  }

  return "neutral";
}
