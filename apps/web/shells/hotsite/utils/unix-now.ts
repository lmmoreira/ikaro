export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}
