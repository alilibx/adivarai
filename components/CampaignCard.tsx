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
  accountBalanceCents,
}: {
  userId: any;
  campaign: any;
  stats: { impressions: number; clicks: number; ctr: number };
  accountBalanceCents: number;
}) {
  const setStatus = useMutation(api.campaigns.setStatus);
  const addCreative = useMutation(api.campaigns.addCreative);
  const genUrl = useMutation(api.campaigns.generateUploadUrl);

  type Fmt = "IMAGE" | "VIDEO" | "NATIVE" | "INTERACTIVE";
  const [type, setType] = useState<Fmt>("IMAGE");
  const [assetUrl, setAssetUrl] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [brandName, setBrandName] = useState("");
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

  async function submitCreative(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setAdding(true);
    try {
      if (!clickUrl) throw new Error("Click-through URL is required");
      if (type === "NATIVE" && !title)
        throw new Error("Sponsored content needs a headline");
      await addCreative({
        userId,
        campaignId: campaign._id,
        type,
        assetUrl: assetUrl || undefined,
        clickUrl,
        title: title || undefined,
        body: body || undefined,
        ctaLabel: ctaLabel || undefined,
        brandName: brandName || undefined,
      });
      setAssetUrl("");
      setClickUrl("");
      setTitle("");
      setBody("");
      setCtaLabel("");
      setBrandName("");
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
            {campaign.status === "ACTIVE" && accountBalanceCents <= 0 && (
              <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
                not serving · fund balance
              </span>
            )}
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
          <form onSubmit={submitCreative} className="space-y-2">
            <p className="text-xs text-zinc-400">Add a creative to launch:</p>

            <div className="grid grid-cols-4 gap-1">
              {(["IMAGE", "VIDEO", "NATIVE", "INTERACTIVE"] as Fmt[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setType(f)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                    type === f
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-edge text-muted"
                  }`}
                >
                  {f === "INTERACTIVE" ? "Playable" : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {type === "NATIVE" ? (
              <>
                <input
                  className="input"
                  placeholder="Brand name"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Headline"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="One line of body copy"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </>
            ) : (
              <input
                className="input"
                placeholder={
                  type === "VIDEO"
                    ? "Video URL (mp4 / webm)"
                    : type === "INTERACTIVE"
                      ? "Playable HTML URL"
                      : "Image URL (or upload below)"
                }
                value={assetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
              />
            )}

            {type !== "IMAGE" && (
              <input
                className="input"
                placeholder="Button label (e.g. Try it free)"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
              />
            )}

            <input
              className="input"
              placeholder="Click-through URL (https://…)"
              value={clickUrl}
              onChange={(e) => setClickUrl(e.target.value)}
            />

            <div className="flex items-center gap-2">
              {(type === "IMAGE" || type === "VIDEO") && (
                <input
                  type="file"
                  accept={type === "VIDEO" ? "video/*" : "image/*"}
                  className="text-xs text-zinc-400"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setAdding(true);
                    try {
                      if (!clickUrl) throw new Error("Add a click-through URL first");
                      const storageId = await uploadFile(f);
                      await addCreative({
                        userId,
                        campaignId: campaign._id,
                        type,
                        storageId: storageId as any,
                        clickUrl,
                        ctaLabel: ctaLabel || undefined,
                      });
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Upload failed");
                    } finally {
                      setAdding(false);
                    }
                  }}
                />
              )}
              <button className="btn-brand ml-auto" disabled={adding}>
                {adding ? "…" : "Add creative"}
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
