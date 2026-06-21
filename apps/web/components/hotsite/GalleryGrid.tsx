'use client';

import { useTranslations } from 'next-intl';
import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';

interface GalleryGridProps {
  readonly children: ReactNode;
  readonly maxVisible: number;
  readonly totalImages: number;
}

const btnStyle: CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

const closeBtnStyle: CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.9)',
  borderRadius: '50%',
};

export function GalleryGrid({ children, maxVisible, totalImages }: GalleryGridProps) {
  const t = useTranslations('hotsite');
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (lightbox) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [lightbox]);

  // Native DOM listener avoids jsx-a11y warnings on the wrapper div — the <a> children are
  // natively keyboard-accessible; click/Enter events bubble up and are intercepted here.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onInteract = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Enter') return;
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-gallery-url]');
      if (!anchor) return;
      e.preventDefault();
      setLightbox({
        url: anchor.dataset.galleryUrl ?? '',
        caption: anchor.dataset.galleryCaption ?? '',
      });
    };

    el.addEventListener('click', onInteract);
    el.addEventListener('keydown', onInteract);
    return () => {
      el.removeEventListener('click', onInteract);
      el.removeEventListener('keydown', onInteract);
    };
  }, []);

  const hasMore = totalImages > maxVisible;

  return (
    <>
      <div ref={wrapperRef} data-gallery-expanded={expanded}>
        {children}
      </div>

      {hasMore && !expanded && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={btnStyle}
            className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 hover:bg-[var(--ba-btn-hover-bg)]"
          >
            {t('gallery.showMore')}
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setLightbox(null)}
        style={{
          width: '100vw',
          height: '100dvh',
          maxWidth: '100vw',
          maxHeight: '100dvh',
          margin: 0,
          padding: '2rem',
          background: 'transparent',
          border: 'none',
        }}
        className="open:flex items-center justify-center backdrop:bg-black/80"
      >
        <button
          type="button"
          aria-label={t('gallery.closeLightboxAriaLabel')}
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'default',
          }}
        />
        {lightbox && (
          <div className="relative" style={{ position: 'relative', zIndex: 1 }}>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label={t('gallery.closeAriaLabel')}
              style={closeBtnStyle}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center shadow-lg hover:bg-white"
            >
              ×
            </button>
            <img
              src={lightbox.url}
              alt={lightbox.caption || t('gallery.photoAlt')}
              style={{
                maxWidth: 'min(85vw, 1200px)',
                maxHeight: '85dvh',
                borderRadius: 'var(--ba-radius)',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            {lightbox.caption && (
              <p className="mt-2 text-center text-sm text-white">{lightbox.caption}</p>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
