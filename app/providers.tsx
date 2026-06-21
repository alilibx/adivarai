"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Id } from "@/convex/_generated/dataModel";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// --- Dev session (localStorage). Replace with real auth later. ---

type Role = "EARNER" | "ADVERTISER";
type Session = { userId: Id<"users">; role: Role; email: string } | null;

type Ctx = {
  session: Session;
  setSession: (s: Session) => void;
  signOut: () => void;
};

const SessionContext = createContext<Ctx>({
  session: null,
  setSession: () => {},
  signOut: () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

const KEY = "adivari.session";

function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session>(null);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) {
      try {
        setSessionState(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const setSession = (s: Session) => {
    setSessionState(s);
    if (typeof window !== "undefined") {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    }
  };

  return (
    <SessionContext.Provider
      value={{ session, setSession, signOut: () => setSession(null) }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  if (!convex) {
    return (
      <div className="mx-auto max-w-xl p-10 text-center text-sm text-zinc-400">
        <p className="mb-2 text-lg text-white">Backend not configured</p>
        <p>
          Set <code className="text-brand2">NEXT_PUBLIC_CONVEX_URL</code> in{" "}
          <code>.env.local</code> (run <code>npx convex dev</code>), then reload.
        </p>
      </div>
    );
  }
  return (
    <ConvexProvider client={convex}>
      <SessionProvider>{children}</SessionProvider>
    </ConvexProvider>
  );
}
