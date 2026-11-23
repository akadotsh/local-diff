export function zoomForKey(current: number, key: string): number | undefined {
  if (key === "0") return 1;
  if (!["+", "=", "-", "_"].includes(key)) return undefined;
  const step = key === "+" || key === "=" ? 0.1 : -0.1;
  return Math.max(0.5, Math.min(3, Math.round((current + step) * 10) / 10));
}
