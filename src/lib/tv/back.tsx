import { createContext, useContext, useEffect, useRef } from 'react';

type Handler = () => boolean;
const Ctx = createContext<{ push: (h: Handler) => void; pop: (h: Handler) => void } | null>(null);

export function TvBackProvider({ onExit, children }: { onExit?: () => void; children: React.ReactNode }) {
  const stack = useRef<Handler[]>([]);
  const api = useRef({
    push: (h: Handler) => { stack.current.push(h); },
    pop: (h: Handler) => { stack.current = stack.current.filter((x) => x !== h); },
  }).current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Backspace' && e.key !== 'GoBack') return;
      // Ignore Backspace typed into inputs.
      if (e.key === 'Backspace' && (e.target as HTMLElement)?.tagName === 'INPUT') return;
      for (let i = stack.current.length - 1; i >= 0; i--) {
        if (stack.current[i]()) { e.preventDefault(); return; }
      }
      if (window.history.length > 1) window.history.back();
      else onExit?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** While `active`, register `handler` at the top of the Back stack. */
export function useTvBack(handler: Handler, active: boolean): void {
  const ctx = useContext(Ctx);
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => {
    if (!ctx || !active) return;
    const h: Handler = () => ref.current();
    ctx.push(h);
    return () => ctx.pop(h);
  }, [ctx, active]);
}
