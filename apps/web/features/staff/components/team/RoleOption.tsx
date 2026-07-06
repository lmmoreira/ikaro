import type { StaffRole } from '@ikaro/types';
import { cn } from '@/shared/utils/cn';

export interface RoleOptionProps {
  readonly staffRole: StaffRole;
  readonly selected: boolean;
  readonly title: string;
  readonly description: string;
  readonly onSelect: (staffRole: StaffRole) => void;
}

// Card-select control shared by InviteForm (create) and StaffDetailPage (edit) —
// static data-testid + a separate data-role attribute so callers can disambiguate
// the two options without a template-literal data-testid (E2E-3).
export function RoleOption({
  staffRole,
  selected,
  title,
  description,
  onSelect,
}: RoleOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid="role-option"
      data-role={staffRole}
      aria-pressed={selected}
      onClick={() => onSelect(staffRole)}
      className={cn(
        'rounded-md border px-3.5 py-3.5 text-left transition-colors',
        selected
          ? 'border-2 border-blue-600 bg-blue-50'
          : 'border-border bg-white hover:bg-slate-50',
      )}
    >
      <span className="block text-sm font-bold text-gray-900">{title}</span>
      <span className="mt-0.5 block text-sm text-gray-500">{description}</span>
    </button>
  );
}
