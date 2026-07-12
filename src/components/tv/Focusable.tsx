import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import styles from './focus.module.css';

export function Focusable({
  children, onEnterPress, onArrowPress, className, as = 'div', focusKey, ariaLabel, onFocus,
}: {
  children: React.ReactNode; onEnterPress?: () => void;
  onArrowPress?: (dir: 'left' | 'right' | 'up' | 'down') => boolean;
  className?: string; as?: 'div' | 'li'; focusKey?: string; ariaLabel?: string; onFocus?: () => void;
}) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => onEnterPress?.(),
    onArrowPress: (dir) => (onArrowPress ? onArrowPress(dir as 'left' | 'right' | 'up' | 'down') : true),
    onFocus: () => onFocus?.(),
  });
  const cls = `${className ?? ''} ${focused ? styles.focused : ''}`.trim();
  const handleClick = (e: React.MouseEvent) => {
    // Don't double-fire when a nested button/link/input handled the click itself
    // (it bubbles up to this wrapper). Only activate on clicks in our own content.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    onEnterPress?.();
  };
  const props = { ref, className: cls, 'aria-label': ariaLabel, onClick: handleClick, role: 'button', tabIndex: -1 };
  return as === 'li' ? <li {...props}>{children}</li> : <div {...props}>{children}</div>;
}
