import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 模态弹窗外壳。负责 WCAG 要求的对话框语义、初始焦点、Tab 焦点陷阱与关闭后焦点归还。
 * Esc 关闭由 Designer 的全局逐层处理器负责,此处不重复绑定以免一次按键连关两层。
 */
export function Modal({
  label,
  className,
  cardClassName,
  onClose,
  children,
}: {
  label: string;
  className?: string;
  cardClassName?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) card.focus();
    return () => {
      const target = restoreRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === card)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`next-modal${className ? ` ${className}` : ''}`}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`next-modal-card${cardClassName ? ` ${cardClassName}` : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
