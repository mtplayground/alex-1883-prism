import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { error, signIn, status } = useAuth();

  return (
    <main className="min-h-screen bg-green-50 text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-8 px-6 py-10 md:grid-cols-[1fr_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Sign in
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
            Open your private planning workspace.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
            Use the secure sign-in flow to continue to the planner.
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <button
            className="flex min-h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            disabled={status === "loading"}
            onClick={signIn}
            type="button"
          >
            Continue securely
          </button>
          <a
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            href="/register"
          >
            Create account
          </a>
          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
