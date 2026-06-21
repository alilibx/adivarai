"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/app/providers";

type Role = "EARNER" | "ADVERTISER";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { setSession } = useSession();
  const signUp = useMutation(api.auth.signUp);
  const signIn = useMutation(api.auth.signIn);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [role, setRole] = useState<Role>(
    (params.get("role") as Role) || "EARNER",
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "signup"
          ? await signUp({ email, name: name || undefined, role })
          : await signIn({ email });
      setSession({ userId: res.userId, role: res.role as Role, email });
      router.push(res.role === "ADVERTISER" ? "/advertiser" : "/earner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="panel p-6">
        <h1 className="text-xl font-semibold">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Dev sign-in — email only, no password.
        </p>

        {mode === "signup" && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {(["EARNER", "ADVERTISER"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  role === r
                    ? "border-brand bg-brand/10 text-white"
                    : "border-edge text-zinc-400"
                }`}
              >
                {r === "EARNER" ? "I'm a developer" : "I'm an advertiser"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="label">Name / company</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-brand w-full" disabled={busy}>
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="mt-4 text-sm text-brand2 hover:underline"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
