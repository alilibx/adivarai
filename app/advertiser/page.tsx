"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSession } from "@/app/providers";
import { usd, num } from "@/lib/format";
import { CreateCampaign } from "@/components/CreateCampaign";
import { CampaignCard } from "@/components/CampaignCard";

export default function AdvertiserPage() {
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace("/login?role=ADVERTISER");
    else if (session.role !== "ADVERTISER") router.replace("/earner");
  }, [session, router]);

  if (!session || session.role !== "ADVERTISER") return null;
  return <Dashboard userId={session.userId} />;
}

function Dashboard({ userId }: { userId: any }) {
  const account = useQuery(api.advertisers.account, { userId });
  const campaigns = useQuery(api.campaigns.list, { userId });
  const reporting = useQuery(api.advertisers.reporting, { userId });
  const topUp = useMutation(api.advertisers.topUp);
  const [amount, setAmount] = useState("50");

  const balanceCents = account?.balanceCents ?? 0;
  const hasActive = !!campaigns?.some((c) => c.status === "ACTIVE");
  const starved = balanceCents <= 0 && hasActive;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Advertiser dashboard</h1>
          <p className="text-sm text-zinc-400">
            Fund a balance, launch campaigns, watch them deliver.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Add funds (USD)</label>
            <input
              className="input w-28"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <button
            className="btn-brand"
            onClick={() =>
              topUp({ userId, amountCents: Math.round(Number(amount) * 100) })
            }
          >
            Top up
          </button>
        </div>
      </div>

      {starved && (
        <div className="panel flex items-center justify-between gap-4 border-warn/50 bg-warn/10 p-4 text-sm">
          <span>
            ⚠️ Your balance is <b>{usd(balanceCents)}</b> — active campaigns can’t
            serve ads until you add funds.
          </span>
          <button
            className="btn-brand whitespace-nowrap"
            onClick={() =>
              topUp({ userId, amountCents: Math.round(Number(amount) * 100) })
            }
          >
            Add {usd(Math.round(Number(amount) * 100))}
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Balance" value={usd(balanceCents)} accent={balanceCents > 0} />
        <Stat label="Spent" value={usd(reporting?.totals.spentCents ?? 0)} />
        <Stat label="Views" value={num(reporting?.totals.impressions ?? 0)} />
        <Stat label="Clicks" value={num(reporting?.totals.clicks ?? 0)} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <CreateCampaign userId={userId} />

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your campaigns</h2>
          {campaigns === undefined && (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
          {campaigns?.length === 0 && (
            <p className="panel p-6 text-sm text-zinc-500">
              No campaigns yet. Create one on the left.
            </p>
          )}
          {campaigns?.map((c) => {
            const report = reporting?.perCampaign.find(
              (p) => p.campaign._id === c._id,
            );
            return (
              <CampaignCard
                key={c._id}
                userId={userId}
                campaign={c}
                accountBalanceCents={balanceCents}
                stats={
                  report
                    ? { impressions: report.impressions, clicks: report.clicks, ctr: report.ctr }
                    : { impressions: 0, clicks: 0, ctr: 0 }
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="stat">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-ok" : ""}`}>
        {value}
      </div>
    </div>
  );
}
