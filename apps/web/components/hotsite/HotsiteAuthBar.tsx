'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getHotsiteCustomerProfile } from '@/lib/api/customers';

interface HotsiteAuthBarProps {
  readonly slug: string;
}

type AuthBarState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; name: string };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function HotsiteAuthBar({ slug }: HotsiteAuthBarProps) {
  const [state, setState] = useState<AuthBarState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile().then((profile) => {
      if (!active) return;
      setState(
        profile ? { status: 'authenticated', name: profile.name } : { status: 'unauthenticated' },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      className="flex h-12 items-center justify-end px-6"
      style={{ backgroundColor: 'var(--ba-secondary)' }}
      data-testid="hotsite-auth-bar"
    >
      {state.status === 'authenticated' && (
        <details className="relative">
          <summary
            className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"
            style={{ color: 'var(--ba-text)' }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: 'var(--ba-primary)' }}
            >
              {getInitials(state.name)}
            </span>
            <span>{state.name}</span>
            <ChevronDown size={14} />
          </summary>
          <div
            className="absolute right-0 top-full z-50 mt-2 min-w-44 overflow-hidden border bg-white shadow-lg"
            style={{ borderColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
          >
            <a
              href={`/${slug}/my-account`}
              className="block px-4 py-2.5 text-sm font-medium"
              style={{ color: 'var(--ba-text)' }}
            >
              Minha conta
            </a>
            <hr style={{ borderColor: 'var(--ba-secondary)' }} />
            <a
              href={`${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${slug}`}
              className="block px-4 py-2.5 text-sm opacity-60"
              style={{ color: 'var(--ba-text)' }}
            >
              Sair
            </a>
          </div>
        </details>
      )}
      {state.status === 'unauthenticated' && (
        <a
          href={`/${slug}/login`}
          data-testid="hotsite-login-link"
          className="text-sm font-medium"
          style={{ color: 'var(--ba-primary)' }}
        >
          Entrar
        </a>
      )}
    </div>
  );
}
