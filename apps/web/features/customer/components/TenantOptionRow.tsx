import type React from 'react';
import type { TenantOption } from '@ikaro/types';

function TenantAvatar({
  name,
  size = 'md',
}: {
  readonly name: string;
  readonly size?: 'sm' | 'md';
}): React.JSX.Element {
  const dimension = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base';
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-bold text-white ${dimension}`}
      style={{ backgroundColor: 'var(--ba-primary)', borderRadius: 'var(--ba-radius)' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-40"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export { TenantAvatar };

interface TenantOptionRowProps {
  readonly tenant: TenantOption;
  readonly isCurrent: boolean;
  readonly disabled: boolean;
  readonly currentBadgeLabel: string;
  readonly loyaltyPointsLabel: string;
  readonly onSelect: () => void;
}

export function TenantOptionRow({
  tenant,
  isCurrent,
  disabled,
  currentBadgeLabel,
  loyaltyPointsLabel,
  onSelect,
}: TenantOptionRowProps): React.JSX.Element {
  const content = (
    <>
      <TenantAvatar name={tenant.name} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--ba-text)' }}>
          {tenant.name}
        </p>
        <p className="text-[0.8125rem] opacity-60" style={{ color: 'var(--ba-text)' }}>
          {loyaltyPointsLabel}
        </p>
      </div>
      {isCurrent ? (
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold"
          style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
        >
          {currentBadgeLabel}
        </span>
      ) : (
        <ChevronIcon />
      )}
    </>
  );

  if (isCurrent) {
    return (
      <div
        data-testid="switch-tenant-current"
        className="flex items-center gap-4 border-2 px-5 py-4 opacity-70"
        style={{
          borderColor: 'var(--ba-primary)',
          backgroundColor: 'var(--ba-secondary)',
          borderRadius: 'var(--ba-radius)',
          boxShadow: 'var(--ba-shadow)',
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="switch-tenant-option"
      disabled={disabled}
      onClick={onSelect}
      className="flex cursor-pointer items-center gap-4 px-5 py-4 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        backgroundColor: 'var(--ba-secondary)',
        borderRadius: 'var(--ba-radius)',
        boxShadow: 'var(--ba-shadow)',
      }}
    >
      {content}
    </button>
  );
}
