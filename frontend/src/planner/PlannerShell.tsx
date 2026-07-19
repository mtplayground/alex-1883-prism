import type { User } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export function PlannerShell({ user }: { user: User }) {
  const { refresh } = useAuth();
  const displayName = user.name ?? user.email;

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
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

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-[120px_1fr]">
          {Array.from({ length: 10 }, (_, index) => {
            const hour = index + 8;
            return (
              <div className="contents" key={hour}>
                <div className="py-4 text-sm font-semibold text-slate-500">
                  {hour > 12 ? hour - 12 : hour} {hour >= 12 ? "PM" : "AM"}
                </div>
                <div className="min-h-16 rounded-md border border-dashed border-slate-300 bg-white" />
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
