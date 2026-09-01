// Formatting helpers shared between the web bundle and the Node test suite.

// Bytes-per-second with adaptive units. Home-server throughput usually sits in the
// KB/s range, where a fixed "MB/s to one decimal" formatter just reads "0.0" around
// the clock — so step down to KB/s and B/s when the rate is small.
export function fmtRate(bytesPerSec) {
  const n = Math.max(0, Number(bytesPerSec) || 0);
  if (n < 1024) return `${Math.round(n)} B/s`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB/s`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(n / 1024 ** 3).toFixed(2)} GB/s`;
}
