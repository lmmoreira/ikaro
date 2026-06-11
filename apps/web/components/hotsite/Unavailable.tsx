import type React from 'react';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-primary)',
};

// Inherits the tenant's branding via [slug]/layout.tsx's applyBranding() — falls back to
// DEFAULT_HOTSITE_BRANDING for tenants that haven't configured a hotsite yet.
export function Unavailable() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <h1 className="mb-4 text-4xl font-bold" style={headingStyle}>
        Em breve
      </h1>
      <p className="text-lg">Estamos preparando algo especial. Volte em breve!</p>
    </main>
  );
}
