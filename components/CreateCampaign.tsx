"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type Bid = "CPM" | "CPC";

export function CreateCampaign({ userId }: { userId: any }) {
  const create = useMutation(api.campaigns.create);
  const [name, setName] = useState("");
  const [bidType, setBidType] = useState<Bid>("CPM");
  const [bid, setBid] = useState("8.00");
  const [budget, setBudget] = useState("100");
  const [ctr, setCtr] = useState("1.0");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await create({
        userId,
        name: name || "Untitled campaign",
        bidType,
        // CPM bid is per 1,000 views; CPC is per click. Both stored in cents.
        bidCents: Math.round(Number(bid) * 100),
        budgetCents: Math.round(Number(budget) * 100),
        predictedCtrBps:
          bidType === "CPC" ? Math.round(Number(ctr) * 100) : undefined,
      });
      setName("");
      setMsg("Campaign created as draft — add a creative, then activate.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel h-fit space-y-4 p-5">
      <h2 className="text-lg font-semibold">New campaign</h2>

      <div>
        <label className="label">Campaign name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Launch week promo"
        />
      </div>

      <div>
        <label className="label">Billing</label>
        <div className="grid grid-cols-2 gap-2">
          {(["CPM", "CPC"] as Bid[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBidType(b)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                bidType === b
                  ? "border-brand bg-brand/10 text-white"
                  : "border-edge text-zinc-400"
              }`}
            >
              {b === "CPM" ? "Per 1,000 views" : "Per click"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">
            {bidType === "CPM" ? "CPM bid ($)" : "CPC bid ($)"}
          </label>
          <input
            className="input"
            value={bid}
            onChange={(e) => setBid(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Lifetime budget ($)</label>
          <input
            className="input"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      </div>

      {bidType === "CPC" && (
        <div>
          <label className="label">Estimated click rate (%)</label>
          <input
            className="input"
            value={ctr}
            onChange={(e) => setCtr(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Used to rank against CPM campaigns (eCPM = CPC × CTR × 1000).
          </p>
        </div>
      )}

      {msg && <p className="text-sm text-brand2">{msg}</p>}
      <button className="btn-brand w-full" disabled={busy}>
        {busy ? "…" : "Create campaign"}
      </button>
    </form>
  );
}
