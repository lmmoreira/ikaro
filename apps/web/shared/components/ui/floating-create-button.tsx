import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

interface FloatingCreateButtonProps {
  readonly href: string;
  readonly label: string;
}

// The mobile create action of a dashboard list screen: a round "+" fixed above the bottom nav.
// It overlays the viewport instead of sitting in the page flow, so the "every control inside a
// card" rule does not apply to it. Desktop shows the create action in the topbar instead.
export function FloatingCreateButton({
  href,
  label,
}: FloatingCreateButtonProps): React.JSX.Element {
  return (
    <Button
      asChild
      size="icon"
      className="fixed bottom-20 right-6 z-20 h-14 w-14 rounded-full shadow-lg shadow-blue-600/35 lg:hidden"
    >
      <Link href={href} aria-label={label}>
        <Plus className="h-6 w-6" aria-hidden="true" />
      </Link>
    </Button>
  );
}
