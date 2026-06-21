// Money + number formatting. Amounts are (possibly fractional) cents.

export function usd(cents: number, opts?: { precise?: boolean }): string {
  const dollars = (cents ?? 0) / 100;
  const digits = opts?.precise ? 4 : 2;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}

export function num(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

export function pct(fraction: number): string {
  return `${((fraction ?? 0) * 100).toFixed(2)}%`;
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
