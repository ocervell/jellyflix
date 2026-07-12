import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation';

export function FocusSection({
  children, className, as = 'div', focusKey, isBoundary = false,
}: {
  children: React.ReactNode; className?: string; as?: 'div' | 'ul' | 'section' | 'header'; focusKey?: string; isBoundary?: boolean;
}) {
  const { ref, focusKey: fk } = useFocusable({ focusKey, isFocusBoundary: isBoundary, trackChildren: true, saveLastFocusedChild: true });
  const Tag = as as 'div';
  return (
    <FocusContext.Provider value={fk}>
      <Tag ref={ref} className={className}>{children}</Tag>
    </FocusContext.Provider>
  );
}
