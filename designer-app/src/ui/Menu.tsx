import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

const MENU_MARGIN = 8;
const MENU_ITEM = '[role="menuitem"]:not([disabled])';

export function MenuSurface({
  label,
  x,
  y,
  onClose,
  children,
}: {
  label: string;
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    setPosition({
      left: Math.max(MENU_MARGIN, Math.min(x, window.innerWidth - rect.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(y, window.innerHeight - rect.height - MENU_MARGIN)),
    });
    card.querySelector<HTMLElement>(MENU_ITEM)?.focus();

    return () => {
      restoreRef.current?.focus();
    };
  }, []);

  const focusItemAt = (index: number) => {
    const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? []);
    if (!items.length) return;
    items[(index + items.length) % items.length].focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(cardRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? []);
    const activeIndex = items.findIndex((item) => item === document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(activeIndex < 0 ? 0 : activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(activeIndex < 0 ? items.length - 1 : activeIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItemAt(items.length - 1);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      ref={cardRef}
      className="context-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ left: position.left, top: position.top }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}
