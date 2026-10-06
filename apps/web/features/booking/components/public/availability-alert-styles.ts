// The two button looks the alert page uses, in the tenant's branding (--ba-* tokens). One copy for
// the login card, the form and the outcome views, so they cannot drift apart.

export const alertPrimaryButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export const alertSecondaryButtonStyle: React.CSSProperties = {
  borderRadius: 'var(--ba-radius)',
  borderColor: 'var(--ba-secondary)',
};

export const alertPrimaryButtonClass =
  'border-2 px-8 py-3 font-semibold transition-all hover:opacity-90';
export const alertSecondaryButtonClass = 'cursor-pointer border px-6 py-3';
