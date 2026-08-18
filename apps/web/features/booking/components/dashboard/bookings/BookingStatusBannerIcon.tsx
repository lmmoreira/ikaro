export type BannerVariant = 'success' | 'danger' | 'info';

function getBannerIconBackgroundClass(variant: BannerVariant): string {
  if (variant === 'success') {
    return 'bg-green-600';
  }

  if (variant === 'danger') {
    return 'bg-red-600';
  }

  return 'bg-blue-600';
}

function getBannerIconSvg(variant: BannerVariant, strokeColor: string): React.JSX.Element {
  if (variant === 'danger') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  if (variant === 'info') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="10" x2="12" y2="16" />
        <circle cx="12" cy="7.5" r="1" fill={strokeColor} stroke="none" />
      </svg>
    );
  }

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Extracted from BookingDetailPage (TD37-S5A) — a self-contained presentational icon, unrelated
// to the banner/action-panel logic around it.
export function BookingStatusBannerIcon({
  variant,
}: {
  readonly variant: BannerVariant;
}): React.JSX.Element {
  const backgroundClass = getBannerIconBackgroundClass(variant);
  const strokeColor = 'white';
  const icon = getBannerIconSvg(variant, strokeColor);

  return (
    <div
      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${backgroundClass}`}
    >
      {icon}
    </div>
  );
}
