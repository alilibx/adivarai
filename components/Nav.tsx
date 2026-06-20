"use client";

import Link from "next/link";
import { useSession } from "@/app/providers";

export function Nav() {
  const { session, signOut } = useSession();
  return (
    <header className="border-b border-edge/70 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">
            A
          </span>
          <span>Adivari AI</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {session ? (
            <>
              <Link
                href={session.role === "ADVERTISER" ? "/advertiser" : "/earner"}
                className="btn-ghost"
              >
                {session.role === "ADVERTISER" ? "Campaigns" : "Earn"}
              </Link>
              <span className="hidden text-zinc-400 sm:inline">{session.email}</span>
              <button onClick={signOut} className="btn-ghost">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-brand">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
