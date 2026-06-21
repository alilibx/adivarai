"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWatchable } from "@/lib/useWatchable";
import { EarningsMeter } from "./EarningsMeter";

const AD_SECONDS = 6; // required *visible* seconds before an impression counts
const STEP_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Plays ads while a session is active. Accrues only visible watch time
// (viewability), renders each creative format, and feeds the earnings meter.
export function AdStage({ userId, sessionId }: { userId: any; sessionId: any }) {
  const selectAd = useMutation(api.ads.selectAd);
  const recordImpression = useMutation(api.ads.recordImpression);
  const recordClick = useMutation(api.ads.recordClick);
  const { watchable, ref: watchableRef } = useWatchable();

  const [ad, setAd] = useState<any>(null);
  const [progress, setProgress] = useState(0); // 0..1 of required watch time
  const [earned, setEarned] = useState(0);
  const [views, setViews] = useState(0);
  const [lastDelta, setLastDelta] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [noFill, setNoFill] = useState(false);
  const [startedAt] = useState(Date.now());
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    (async () => {
      while (activeRef.current) {
        while (activeRef.current && !watchableRef.current) await sleep(STEP_MS);
        if (!activeRef.current) break;

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
        setProgress(0);

        let watchedMs = 0;
        while (watchedMs < AD_SECONDS * 1000 && activeRef.current) {
          await sleep(STEP_MS);
          if (watchableRef.current) {
            watchedMs += STEP_MS;
            setProgress(Math.min(1, watchedMs / (AD_SECONDS * 1000)));
          }
        }
        if (!activeRef.current) break;

        const r = await recordImpression({ userId, token: res.token }).catch(
          () => null,
        );
        if (r && (r.earnedCents ?? 0) > 0) {
          setEarned((e) => e + r.earnedCents);
          setViews((v) => v + 1);
          setLastDelta(r.earnedCents);
          setPulseKey((k) => k + 1);
        }
        setAd(null);
        await sleep(500);
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
  const ratePerHr = mins > 0.03 ? (earned / mins) * 60 : 0;
  const paused = !!ad && !watchable;
  const secsLeft = ad ? Math.max(1, Math.ceil(AD_SECONDS * (1 - progress))) : 0;

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/50">
        {/* progress rail */}
        {ad && (
          <div className="absolute inset-x-0 top-0 z-20 h-0.5 bg-white/10">
            <div
              className="h-full bg-gold transition-[width] duration-200 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        <div className="grid place-items-center" style={{ minHeight: 220 }}>
          {ad ? (
            <AdCreative ad={ad} onClickAd={onClickAd} secsLeft={secsLeft} />
          ) : noFill ? (
            <p className="px-6 text-center text-sm text-muted">
              No ads available right now. Earnings resume when a campaign with
              budget is live.
            </p>
          ) : (
            <p className="text-sm text-muted">Loading next ad…</p>
          )}
        </div>

        {paused && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 text-center">
            <div className="px-6">
              <div className="font-display text-lg">Paused</div>
              <p className="mt-1 text-xs text-muted">
                Focus this window to keep earning — hidden ads don&apos;t count.
              </p>
            </div>
          </div>
        )}
      </div>

      <EarningsMeter
        ratePerHr={ratePerHr}
        sessionCents={earned}
        views={views}
        pulseKey={pulseKey}
        lastDelta={lastDelta}
        live={!!ad && !paused}
      />
    </div>
  );
}

// Renders one creative according to its format.
function AdCreative({
  ad,
  onClickAd,
  secsLeft,
}: {
  ad: any;
  onClickAd: () => void;
  secsLeft: number;
}) {
  const c = ad.creative;
  const Timer = (
    <span className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-0.5 font-mono text-[11px] text-ink">
      {secsLeft}s
    </span>
  );

  if (c.type === "NATIVE") {
    return (
      <div className="w-full p-5">
        {c.brandName && (
          <div className="eyebrow mb-2">Sponsored · {c.brandName}</div>
        )}
        <h3 className="font-display text-lg leading-snug text-ink">
          {c.title ?? "Sponsored"}
        </h3>
        {c.body && <p className="mt-2 text-sm text-muted">{c.body}</p>}
        <button onClick={onClickAd} className="btn-gold mt-4">
          {c.ctaLabel ?? "Learn more"}
        </button>
      </div>
    );
  }

  if (c.type === "VIDEO" && c.assetUrl) {
    return (
      <button onClick={onClickAd} className="relative block h-full w-full">
        {Timer}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={c.assetUrl}
          autoPlay
          muted
          loop
          playsInline
          className="max-h-[260px] w-full object-contain"
        />
      </button>
    );
  }

  if (c.type === "INTERACTIVE" && c.assetUrl) {
    return (
      <div className="relative h-[240px] w-full">
        {Timer}
        <iframe
          src={c.assetUrl}
          title="ad"
          sandbox="allow-scripts allow-same-origin"
          className="h-full w-full border-0"
        />
        <button
          onClick={onClickAd}
          className="absolute bottom-2 right-2 z-10 rounded-md bg-gold px-2 py-1 text-[11px] font-semibold text-black"
        >
          {c.ctaLabel ?? "Visit"}
        </button>
      </div>
    );
  }

  // IMAGE (and fallback for missing assets)
  return (
    <button onClick={onClickAd} className="group relative block">
      {Timer}
      {c.assetUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.assetUrl}
          alt={c.title ?? "ad"}
          className="max-h-[260px] w-full object-contain"
        />
      ) : (
        <div className="grid h-44 w-72 place-items-center bg-gradient-to-br from-brand/25 to-gold/15 px-4 text-center">
          <span className="text-sm text-ink">
            {c.title ?? "Your ad here"}
            <span className="mt-1 block font-mono text-[11px] text-muted">
              {c.clickUrl}
            </span>
          </span>
        </div>
      )}
    </button>
  );
}
