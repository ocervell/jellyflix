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
  const props = { ref, className: cls, 'aria-label': ariaLabel, onClick: () => onEnterPress?.(), role: 'button', tabIndex: -1 };
  return as === 'li' ? <li {...props}>{children}</li> : <div {...props}>{children}</div>;
}
