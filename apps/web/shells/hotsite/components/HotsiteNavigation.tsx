'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteNavigationItem } from '@ikaro/types';

interface HotsiteNavigationProps {
  readonly items: readonly HotsiteNavigationItem[];
  readonly slug: string;
}

const LINK_CLASS = 'text-[0.8125rem] font-medium no-underline hover:opacity-70';

// The NAVIGATION module's links, rendered inside the one top bar (HotsiteAuthBar and the editor
// preview's signed-out bar) — never as a second header. Hrefs are absolute to the home page
// (`/{slug}#service-list`), so they also work from /booking and the other hotsite routes.
// Desktop shows the links inline; on a narrow screen they collapse into a <details> menu that
// closes on Escape, on an outside click and when a link is tapped. The menu panel spans the bar
// (the <header> is its positioning context), so it fits any phone width whatever the logo and
// staff-area link push the trigger to.
export function HotsiteNavigation({
  items,
  slug,
}: HotsiteNavigationProps): React.JSX.Element | null {
  const t = useTranslations('hotsite.navigation');
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  // The listeners are always attached and read the live `open` state of the element, never React's
  // copy of it: a visitor can open the menu (a native <details>) before this component has
  // hydrated, and a listener that only exists while React believes the menu is open would miss
  // exactly that case.
  useEffect(() => {
    const close = (): void => {
      if (menuRef.current?.open) menuRef.current.open = false;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  if (items.length === 0) return null;

  const closeMenu = (): void => {
    if (menuRef.current) menuRef.current.open = false;
  };

  return (
    <>
      <nav
        aria-label={t('ariaLabel')}
        data-testid="hotsite-navigation"
        className="hidden flex-1 items-center justify-center gap-6 md:flex"
      >
        {items.map((item) => (
          <a
            key={`${item.target}-${item.label}`}
            href={`/${slug}#${item.target}`}
            className={LINK_CLASS}
            style={{ color: 'var(--ba-secondary-text, var(--ba-text))' }}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <details
        ref={menuRef}
        data-testid="hotsite-navigation-menu"
        className="md:hidden"
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary
          className="flex h-8 w-8 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
          style={{ color: 'var(--ba-secondary-text, var(--ba-text))' }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
          <span className="sr-only">{open ? t('closeMenu') : t('openMenu')}</span>
        </summary>
        <nav
          aria-label={t('ariaLabel')}
          className="absolute inset-x-0 top-full z-50 flex flex-col overflow-hidden border-t shadow-lg"
          style={{
            backgroundColor: 'var(--ba-secondary)',
            borderColor: 'var(--ba-background)',
          }}
        >
          {items.map((item) => (
            <a
              key={`${item.target}-${item.label}`}
              href={`/${slug}#${item.target}`}
              onClick={closeMenu}
              className={`${LINK_CLASS} px-4 py-3`}
              style={{ color: 'var(--ba-secondary-text, var(--ba-text))' }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </details>
    </>
  );
}
