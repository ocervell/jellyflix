export function nextScrollLeft(
  el: { scrollLeft: number; clientWidth: number; scrollWidth: number },
  dir: 1 | -1,
): number {
  const max = el.scrollWidth - el.clientWidth;
  const target = el.scrollLeft + dir * el.clientWidth;
  return Math.max(0, Math.min(max, target));
}
