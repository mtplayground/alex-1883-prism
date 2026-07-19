import { useEffect, useMemo, useState } from "react";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { RegisterPage } from "./auth/RegisterPage";
import { PlannerShell } from "./planner/PlannerShell";

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
  const { status, user } = useAuth();
  const [path, setPath] = usePathname();

  useEffect(() => {
    if (status === "signed-in" && ["/", "/login", "/register"].includes(path)) {
      setPath("/planner");
    }
  }, [path, setPath, status]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (path === "/login") {
    return <LoginPage />;
  }

  if (path === "/register") {
    return <RegisterPage />;
  }

  if (path === "/planner") {
    return user ? <PlannerShell user={user} /> : <LoginPage />;
  }

  return user ? <PlannerShell user={user} /> : <SignedOutHome />;
}

function SignedOutHome() {
  const { signIn } = useAuth();

  return (
    <main className="min-h-screen bg-green-50 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_420px]">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Client time planner
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-normal text-slate-950 sm:text-6xl">
              Keep client work and personal time clear in one day view.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
              Sign in to start building a private planner for clients, colors,
              initials, and time blocks as the remaining workflow comes online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                onClick={signIn}
                type="button"
              >
                Sign in
              </button>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                href="/register"
              >
                Create account
              </a>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-[72px_1fr] gap-3 text-sm">
              {[
                ["8 AM", "Plan the client day"],
                ["10 AM", "Deep work block"],
                ["1 PM", "Personal time"],
                ["3 PM", "Client follow-up"],
              ].map(([time, label]) => (
                <div className="contents" key={time}>
                  <div className="py-3 font-semibold text-slate-500">
                    {time}
                  </div>
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 font-medium text-emerald-950">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-green-50 px-6 text-slate-950">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Loading planner
      </div>
    </main>
  );
}

function usePathname(): [string, (path: string) => void] {
  const [path, setPathState] = useState(() => window.location.pathname || "/");

  useEffect(() => {
    const update = () => setPathState(window.location.pathname || "/");
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  const setPath = useMemo(
    () => (nextPath: string) => {
      if (window.location.pathname !== nextPath) {
        window.history.pushState({}, "", nextPath);
      }
      setPathState(nextPath);
    },
    [],
  );

  return [path, setPath];
}
