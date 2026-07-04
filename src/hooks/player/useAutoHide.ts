import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoHide(active: boolean): { visible: boolean; ping: () => void } {
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const ping = useCallback(() => {
    setVisible(true);
    window.clearTimeout(timer.current);
    if (active) timer.current = window.setTimeout(() => setVisible(false), 3000);
  }, [active]);
  useEffect(() => { ping(); return () => window.clearTimeout(timer.current); }, [ping]);
  return { visible, ping };
}
