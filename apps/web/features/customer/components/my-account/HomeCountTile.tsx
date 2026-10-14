import Link from 'next/link';
import { cn } from '@/shared/utils/cn';

interface HomeCountTileProps {
  readonly href: string;
  readonly label: string;
  readonly value: string;
  /** The tile's icon, already coloured (a lucide icon sized `h-[18px] w-[18px]`). */
  readonly icon: React.ReactNode;
  /** Tailwind background of the icon's rounded square, e.g. `bg-blue-50`. */
  readonly iconBackground: string;
  /** Test id of the value line, so a spec or an E2E can read the number the tile shows. */
  readonly valueTestId: string;
}

/**
 * One linking summary tile on the customer Início: icon, label, value, and the whole tile is the
 * link to the page it summarises.
 */
export function HomeCountTile({
  href,
  label,
  value,
  icon,
  iconBackground,
  valueTestId,
}: HomeCountTileProps): React.JSX.Element {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm hover:bg-gray-50"
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          iconBackground,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-semibold text-gray-500">{label}</p>
        <p
          data-testid={valueTestId}
          className="text-[1.1875rem] font-bold leading-tight text-gray-900"
        >
          {value}
        </p>
      </div>
    </Link>
  );
}
