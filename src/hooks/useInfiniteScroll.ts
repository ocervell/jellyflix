import { useEffect, useRef } from 'react';

export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean): { sentinelRef: React.RefObject<HTMLDivElement> } {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cb = useRef(onLoadMore); cb.current = onLoadMore;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return { sentinelRef: sentinelRef as React.RefObject<HTMLDivElement> };
}
