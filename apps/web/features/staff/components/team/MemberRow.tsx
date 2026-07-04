import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { StaffListItem, StaffStatus } from '@ikaro/types';
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

function MemberAction({ member, isCurrentUser }: MemberRowProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.teamPage');

  if (member.status === 'PENDING') {
    return (
      <Link
        href={`/dashboard/team/invite?email=${encodeURIComponent(member.email)}`}
        className="text-sm font-semibold text-blue-600 hover:underline"
      >
        {t('resendInvite')}
      </Link>
    );
  }

  if (member.status === 'ACTIVE' && !isCurrentUser) {
    return (
      <Link
        href={`/dashboard/team/${member.id}/deactivate`}
        className="text-sm font-semibold text-red-600 hover:underline"
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
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
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
