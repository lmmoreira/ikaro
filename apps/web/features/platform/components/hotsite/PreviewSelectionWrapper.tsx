'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteModuleType } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';

interface PreviewSelectionWrapperProps {
  readonly type: HotsiteModuleType;
  readonly selected: boolean;
  // A `position: fixed` module (the chatbot bubble) takes no space in the flow, so a flow-sized
  // overlay would be zero-sized; the overlay is then pinned to the bubble's own corner instead.
  readonly fixedOverlay: boolean;
  readonly onSelect: (type: HotsiteModuleType) => void;
  readonly children: React.ReactNode;
}

// True once the wrapped module has actually rendered an element. Some modules render nothing
// (an empty gallery, the chatbot until its live availability check passes); an overlay button
// over nothing would be an invisible, focusable control.
function useHasRenderedContent(ref: RefObject<HTMLElement | null>): boolean {
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = (): void => setHasContent(element.childElementCount > 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true });
    return () => observer.disconnect();
  }, [ref]);

  return hasContent;
}

// Editor-only selection boundary around a real public hotsite module. The module's content is
// `inert` (and pointer-transparent), so none of its visitor actions — CTA links, the lead form
// link, booking start, the chat bubble — can run inside the editor; a sibling overlay button
// carries the section's accessible name and is the only interactive element. The module's own
// props and the render plan are untouched.
export function PreviewSelectionWrapper({
  type,
  selected,
  fixedOverlay,
  onSelect,
  children,
}: PreviewSelectionWrapperProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const contentRef = useRef<HTMLDivElement>(null);
  const hasContent = useHasRenderedContent(contentRef);
  const label = t(`layout.modules.${type}`);
  const overlayPosition = fixedOverlay
    ? 'fixed bottom-6 right-6 h-14 w-14 rounded-full'
    : 'absolute inset-0';
  const state = selected
    ? 'outline outline-2 -outline-offset-2 outline-blue-600'
    : 'hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-blue-300';

  return (
    <div data-testid="preview-section" data-module-type={type} className="relative">
      <div ref={contentRef} inert className="pointer-events-none">
        {children}
      </div>
      {hasContent && (
        <button
          type="button"
          data-testid="preview-section-select"
          data-module-type={type}
          aria-label={t('visual.selectSection', { module: label })}
          aria-pressed={selected}
          onClick={() => onSelect(type)}
          className={`${overlayPosition} z-10 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${state}`}
        />
      )}
      {hasContent && selected && !fixedOverlay && (
        <Badge
          aria-hidden="true"
          data-testid="preview-section-badge"
          className="pointer-events-none absolute left-2 top-2 z-10 bg-blue-600 text-white"
        >
          {t('visual.selectedBadge')} · {label}
        </Badge>
      )}
    </div>
  );
}
