'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface PhotoTileProps {
  readonly url: string;
  readonly alt: string;
  readonly unavailableLabel: string;
  readonly unavailableAlt: string;
  /** Classes applied to the `<img>` on success — callers keep their own border/background styling. */
  readonly className: string;
}

/**
 * Renders a booking photo, falling back to a same-footprint placeholder on
 * load failure. Booking photos are deleted from storage after the
 * retention window (M17-S45) while the DB reference dangles by design — the
 * signed URL is generated blind (no backend existence check) and the actual
 * GET goes straight browser-to-GCS, so a missing object surfaces here as a
 * plain image `onError`, never as a backend error.
 */
export function PhotoTile({
  url,
  alt,
  unavailableLabel,
  unavailableAlt,
  className,
}: PhotoTileProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={unavailableAlt}
        className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-400"
      >
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span className="text-[0.6875rem] font-medium">{unavailableLabel}</span>
      </div>
    );
  }

  return (
    <img src={url} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
  );
}
