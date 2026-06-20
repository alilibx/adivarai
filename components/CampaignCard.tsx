"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usd, num, pct } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-ok border-ok/40 bg-ok/10",
  DRAFT: "text-zinc-400 border-edge",
  PAUSED: "text-warn border-warn/40 bg-warn/10",
  OUT_OF_BUDGET: "text-red-400 border-red-400/40 bg-red-400/10",
};

export function CampaignCard({
  userId,
  campaign,
  stats,
}: {
  userId: any;
  campaign: any;
  stats: { impressions: number; clicks: number; ctr: number };
}) {
  const setStatus = useMutation(api.campaigns.setStatus);
  const addCreative = useMutation(api.campaigns.addCreative);
  const genUrl = useMutation(api.campaigns.generateUploadUrl);

  const [assetUrl, setAssetUrl] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasCreative = campaign.creatives.length > 0;
  const pctSpent = campaign.budgetCents
    ? campaign.spentCents / campaign.budgetCents
    : 0;

  async function uploadFile(file: File) {
    const url = await genUrl({ userId });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const { storageId } = await res.json();
    return storageId as string;
  }

  async function addImage(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setAdding(true);
    try {
      if (!clickUrl) throw new Error("Click-through URL is required");
      await addCreative({
        userId,
        campaignId: campaign._id,
        type: "IMAGE",
        assetUrl: assetUrl || undefined,
        clickUrl,
      });
      setAssetUrl("");
      setClickUrl("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{campaign.name}</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                STATUS_STYLE[campaign.status] ?? "border-edge text-zinc-400"
              }`}
            >
              {campaign.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            {campaign.bidType === "CPM"
              ? `${usd(campaign.bidCents)} per 1,000 views`
              : `${usd(campaign.bidCents)} per click`}{" "}
            · budget {usd(campaign.budgetCents)}
          </p>
        </div>
        <div className="flex gap-2">
          {campaign.status === "ACTIVE" ? (
            <button
              className="btn-ghost"
              onClick={() =>
                setStatus({ userId, campaignId: campaign._id, status: "PAUSED" })
              }
            >
              Pause
            </button>
          ) : campaign.status === "OUT_OF_BUDGET" ? (
            <span className="self-center text-xs text-zinc-500">Budget spent</span>
          ) : (
            <button
              className="btn-brand"
              disabled={!hasCreative}
              title={hasCreative ? "" : "Add a creative first"}
              onClick={() =>
                setStatus({ userId, campaignId: campaign._id, status: "ACTIVE" })
              }
            >
              Activate
            </button>
          )}
        </div>
      </div>

      {/* spend bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full bg-brand"
          style={{ width: `${Math.min(100, pctSpent * 100)}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
        <Mini label="Spent" value={usd(campaign.spentCents)} />
        <Mini label="Views" value={num(stats.impressions)} />
        <Mini label="Clicks" value={num(stats.clicks)} />
        <Mini label="CTR" value={pct(stats.ctr)} />
      </div>

      {/* creatives */}
      <div className="mt-4 border-t border-edge pt-4">
        {hasCreative ? (
          <div className="flex flex-wrap gap-2">
            {campaign.creatives.map((cr: any) => (
              <span
                key={cr._id}
                className="rounded-md border border-edge px-2 py-1 text-xs text-zinc-400"
              >
                {cr.type} → {cr.clickUrl}
              </span>
            ))}
          </div>
        ) : (
          <form onSubmit={addImage} className="space-y-2">
            <p className="text-xs text-zinc-400">Add a creative to launch:</p>
            <input
              className="input"
              placeholder="Image URL (or leave blank + upload below)"
              value={assetUrl}
              onChange={(e) => setAssetUrl(e.target.value)}
            />
            <input
              className="input"
              placeholder="Click-through URL (https://…)"
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                className="text-xs text-zinc-400"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setAdding(true);
                  try {
                    const storageId = await uploadFile(f);
                    if (!clickUrl) throw new Error("Add a click-through URL first");
                    await addCreative({
                      userId,
                      campaignId: campaign._id,
                      type: "IMAGE",
                      storageId: storageId as any,
                      clickUrl,
                    });
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Upload failed");
                  } finally {
                    setAdding(false);
                  }
                }}
              />
              <button className="btn-brand ml-auto" disabled={adding}>
                {adding ? "…" : "Add image URL"}
              </button>
            </div>
            {err && <p className="text-xs text-red-400">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
