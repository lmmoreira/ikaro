'use client';

import { useTranslations } from 'next-intl';
import type { StaffRole } from '@ikaro/types';
import { RoleOption } from '@/features/staff/components/team/RoleOption';

interface RoleSelectorFieldProps {
  readonly staffRole: StaffRole;
  readonly onSelect: (staffRole: StaffRole) => void;
}

// Shared STAFF/MANAGER selector fieldset used by both InviteForm (create) and
// StaffDetailPage (edit) — same field, same copy, same two RoleOption cards.
export function RoleSelectorField({
  staffRole,
  onSelect,
}: RoleSelectorFieldProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold text-gray-900">{t('roleLabel')}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <RoleOption
          staffRole="STAFF"
          selected={staffRole === 'STAFF'}
          title={t('roleStaff')}
          description={t('roleStaffDesc')}
          onSelect={onSelect}
        />
        <RoleOption
          staffRole="MANAGER"
          selected={staffRole === 'MANAGER'}
          title={t('roleManager')}
          description={t('roleManagerDesc')}
          onSelect={onSelect}
        />
      </div>
    </fieldset>
  );
}
