import type { User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ClientManager } from "./ClientManager";
import { DayTimeline } from "./DayTimeline";

export function PlannerShell({ user }: { user: User }) {
  const { refresh } = useAuth();
  const displayName = user.name ?? user.email;

  return (
    <main className="min-h-screen bg-green-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Planner
            </p>
            <h1 className="text-lg font-semibold text-slate-950">Today</h1>
          </div>
          <div className="flex items-center gap-3">
            {user.picture_url ? (
              <img
                alt=""
                className="h-9 w-9 rounded-full border border-slate-200"
                src={user.picture_url}
              />
            ) : null}
            <div className="text-right text-sm">
              <div className="font-semibold text-slate-950">{displayName}</div>
              <button
                className="text-emerald-700 hover:text-emerald-800"
                onClick={() => void refresh()}
                type="button"
              >
                Refresh session
              </button>
            </div>
          </div>
        </div>
      </header>

      <DayTimeline />
      <ClientManager />
    </main>
  );
}
