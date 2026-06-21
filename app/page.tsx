import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-12">
      <section className="text-center">
        <p className="mb-3 inline-block rounded-full border border-edge px-3 py-1 text-xs text-brand2">
          Monetize your agent&apos;s thinking time
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Get paid while your coding agent works.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Claude Code, Codex, Cursor, Gemini CLI — they all spend real time
          working while you wait. Adivari turns that wait into earnings: watch a
          few ads, get a share of what advertisers pay. Advertisers reach
          engaged developers with simple CPM &amp; CPC campaigns.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/login?role=EARNER" className="btn-brand">
            Start earning
          </Link>
          <Link href="/login?role=ADVERTISER" className="btn-ghost">
            Advertise
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            t: "1 · Agent gets busy",
            d: "When your agent starts a task, Adivari detects the busy time via official hooks or a CLI wrapper.",
          },
          {
            t: "2 · Watch while you wait",
            d: "Ads play in the companion surface. Only focused, viewable impressions count.",
          },
          {
            t: "3 · Earn a real share",
            d: "You earn a share of what advertisers were actually billed — shown as a live ~$/hr.",
          },
        ].map((c) => (
          <div key={c.t} className="panel p-5">
            <h3 className="font-semibold text-white">{c.t}</h3>
            <p className="mt-2 text-sm text-zinc-400">{c.d}</p>
          </div>
        ))}
      </section>

      <section className="panel p-6">
        <h2 className="text-lg font-semibold">How the money works</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          One pool: advertisers fund it by being billed for views (CPM) and
          clicks (CPC); earners are paid a ~60% share of that realized revenue;
          the platform keeps the spread. We can never pay out more than was
          billed. See the full model in PAYMENTS.md.
        </p>
      </section>
    </div>
  );
}
