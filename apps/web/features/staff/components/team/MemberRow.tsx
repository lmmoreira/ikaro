'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { StaffListItem, StaffStatus } from '@ikaro/types';
import { useInviteStaff } from '@/features/staff/hooks/useStaff';
import { getInitials } from '@/shared/utils/initials';
import { cn } from '@/shared/utils/cn';

const STATUS_BADGE_CLASSES: Record<StaffStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-700',
  DEACTIVATED: 'bg-red-50 text-red-700',
};

const STATUS_LABEL_KEYS: Record<StaffStatus, string> = {
  ACTIVE: 'statusActive',
  PENDING: 'statusPending',
  DEACTIVATED: 'statusInactive',
};

interface MemberRowProps {
  readonly member: StaffListItem;
  readonly isCurrentUser: boolean;
}

// The invite flow requires firstName/lastName as separate fields, but the domain only ever
// stores one concatenated `name`. Splitting on the first space recovers the exact original
// invite-flow name (both parts were required non-empty strings joined by a single space), so
// resending is lossless for any row created through the normal invite form. Falls back to the
// email's local part when name is null (e.g. a never-logged-in platform-provisioned manager).
function splitFullName(
  name: string | null,
  email: string,
): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    const localPart = email.split('@')[0] || email;
    return { firstName: localPart, lastName: localPart };
  }
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { firstName: trimmed, lastName: trimmed };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

function ResendInviteAction({ member }: { readonly member: StaffListItem }): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const inviteStaffMutation = useInviteStaff();
  const [resendState, setResendState] = useState<'idle' | 'success' | 'error'>('idle');

  async function handleResend(): Promise<void> {
    setResendState('idle');
    const { firstName, lastName } = splitFullName(member.name, member.email);
    try {
      await inviteStaffMutation.mutateAsync({
        email: member.email,
        firstName,
        lastName,
        role: member.role,
      });
      setResendState('success');
    } catch {
      setResendState('error');
    }
  }

  return (
    <div className="relative z-20 flex items-center gap-2">
      <button
        type="button"
        data-testid="resend-invite-button"
        onClick={() => void handleResend()}
        disabled={inviteStaffMutation.isPending}
        className="text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
      >
        {inviteStaffMutation.isPending ? t('resendInviting') : t('resendInvite')}
      </button>
      {resendState === 'success' && (
        <span
          data-testid="resend-invite-success"
          className="text-xs font-semibold text-emerald-600"
        >
          {t('resendInviteSuccess')}
        </span>
      )}
      {resendState === 'error' && (
        <span data-testid="resend-invite-error" className="text-xs font-semibold text-red-600">
          {t('resendInviteError')}
        </span>
      )}
    </div>
  );
}

function MemberAction({ member, isCurrentUser }: MemberRowProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.teamPage');

  if (member.status === 'PENDING') {
    return <ResendInviteAction member={member} />;
  }

  if (member.status === 'ACTIVE' && !isCurrentUser) {
    return (
      <Link
        href={`/dashboard/team/${member.id}/deactivate`}
        className="relative z-20 text-sm font-semibold text-red-600 hover:underline"
      >
        {t('deactivate')}
      </Link>
    );
  }

  return null;
}

export function MemberRow({ member, isCurrentUser }: MemberRowProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');

  return (
    <div className="relative flex flex-wrap items-center gap-3 px-4 py-3.5">
      <Link
        href={`/dashboard/team/${member.id}`}
        className="absolute inset-0 z-10"
        aria-label={t('viewDetailsAriaLabel', { name: member.name ?? member.email })}
      />
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
      >
        {getInitials(member.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">
          {member.name ?? member.email}
        </p>
        <p className="truncate text-sm text-gray-500">{member.email}</p>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        {member.role === 'MANAGER' ? t('roleManager') : t('roleStaff')}
      </span>
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-xs font-semibold',
          STATUS_BADGE_CLASSES[member.status],
        )}
      >
        {t(STATUS_LABEL_KEYS[member.status])}
      </span>
      <MemberAction member={member} isCurrentUser={isCurrentUser} />
    </div>
  );
}
