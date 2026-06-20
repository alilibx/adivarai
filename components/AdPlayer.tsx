"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { usd } from "@/lib/format";

const AD_SECONDS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Simulates the desktop ad surface: while a work session is active it pulls
 * ads, "shows" each for a few seconds, then confirms the viewable impression.
 * In the real product this lives in the Tauri app and is gated by window focus.
 */
export function AdPlayer({
  userId,
  sessionId,
}: {
  userId: any;
  sessionId: any;
}) {
  const selectAd = useMutation(api.ads.selectAd);
  const recordImpression = useMutation(api.ads.recordImpression);
  const recordClick = useMutation(api.ads.recordClick);

  const [ad, setAd] = useState<any>(null);
  const [count, setCount] = useState(AD_SECONDS);
  const [earned, setEarned] = useState(0);
  const [views, setViews] = useState(0);
  const [noFill, setNoFill] = useState(false);
  const [startedAt] = useState(Date.now());
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    (async () => {
      while (activeRef.current) {
        const res = await selectAd({ userId, sessionId }).catch(() => null);
        if (!activeRef.current) break;
        if (!res) {
          setNoFill(true);
          setAd(null);
          await sleep(2500);
          continue;
        }
        setNoFill(false);
        setAd(res);
        for (let s = AD_SECONDS; s > 0 && activeRef.current; s--) {
          setCount(s);
          await sleep(1000);
        }
        if (!activeRef.current) break;
        const r = await recordImpression({ userId, token: res.token }).catch(
          () => null,
        );
        if (r) {
          setEarned((e) => e + (r.earnedCents ?? 0));
          setViews((v) => v + 1);
        }
        setAd(null);
        await sleep(700);
      }
    })();
    return () => {
      activeRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function onClickAd() {
    if (!ad) return;
    const r = await recordClick({ userId, token: ad.token }).catch(() => null);
    if (r?.clickUrl) window.open(r.clickUrl, "_blank", "noopener");
  }

  const mins = (Date.now() - startedAt) / 60000;
  const ratePerHr = mins > 0.05 ? (earned / mins) * 60 : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2 text-xs text-zinc-400">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
          Agent busy · ads playing
        </span>
        <span>~{usd(ratePerHr)}/hr · {views} views</span>
      </div>

      <div className="grid place-items-center bg-black/40 p-6" style={{ minHeight: 240 }}>
        {ad ? (
          <button onClick={onClickAd} className="group relative block">
            {ad.creative.assetUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ad.creative.assetUrl}
                alt="ad"
                className="max-h-52 rounded-lg border border-edge"
              />
            ) : (
              <div className="grid h-40 w-72 place-items-center rounded-lg border border-edge bg-gradient-to-br from-brand/30 to-brand2/20 text-center text-sm">
                <span>
                  Your ad here
                  <br />
                  <span className="text-xs text-zinc-400">{ad.creative.clickUrl}</span>
                </span>
              </div>
            )}
            <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs">
              {count}s
            </span>
            <span className="mt-2 block text-center text-xs text-brand2 opacity-0 transition group-hover:opacity-100">
              click to visit (counts as a click)
            </span>
          </button>
        ) : noFill ? (
          <p className="text-sm text-zinc-500">
            No ads available right now — earnings paused. (Create an active
            campaign with budget to see fill.)
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Loading next ad…</p>
        )}
      </div>

      <div className="border-t border-edge px-4 py-2 text-center text-xs text-zinc-500">
        Earned this session: <span className="text-ok">{usd(earned)}</span>
      </div>
    </div>
  );
}
