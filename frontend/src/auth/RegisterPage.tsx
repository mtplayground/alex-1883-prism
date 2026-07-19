import { useAuth } from "./AuthContext";

export function RegisterPage() {
  const { error, register, signIn, status, user } = useAuth();

  return (
    <main className="min-h-screen bg-green-50 text-slate-950">
      <section className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-8 px-6 py-10 md:grid-cols-[1fr_380px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Create account
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
            Start with secure sign-in, then save your planner profile.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
            Registration uses a verified session and stores only the local
            profile needed for planner data ownership.
          </p>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          {user ? (
            <button
              className="flex min-h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              onClick={register}
              type="button"
            >
              Finish registration
            </button>
          ) : (
            <button
              className="flex min-h-11 w-full items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              disabled={status === "loading"}
              onClick={signIn}
              type="button"
            >
              Continue securely
            </button>
          )}
          <a
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            href="/login"
          >
            Sign in instead
          </a>
          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
