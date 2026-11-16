'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/utils/cn';

interface NavLockMarkProps {
  readonly className?: string;
}

// The padlock on a nav item whose feature the tenant does not hold (UC-125). The item keeps its
// real href (it leads to the locked page), so the padlock carries the accessible name.
export function NavLockMark({ className }: NavLockMarkProps): React.JSX.Element {
  const t = useTranslations('dashboard');

  return (
    <>
      <Lock
        className={cn('h-3.5 w-3.5 shrink-0', className)}
        aria-hidden="true"
        data-testid="nav-lock"
      />
      <span className="sr-only">{t('billing.locked.padlockLabel')}</span>
    </>
  );
}
