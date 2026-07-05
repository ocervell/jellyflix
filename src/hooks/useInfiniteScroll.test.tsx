import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useInfiniteScroll } from './useInfiniteScroll';

test('fires onLoadMore when the sentinel intersects and enabled', () => {
  let trigger: (entries: { isIntersecting: boolean }[]) => void = () => {};
  const observe = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) { trigger = cb; }
    observe = observe; disconnect = vi.fn();
  });
  const onLoadMore = vi.fn();
  function C() { const { sentinelRef } = useInfiniteScroll(onLoadMore, true); return <div ref={sentinelRef} />; }
  render(<C />);
  expect(observe).toHaveBeenCalled();
  trigger([{ isIntersecting: true }]);
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});
