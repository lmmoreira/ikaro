import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';

interface SectionCardProps {
  readonly title: string;
  readonly children: React.ReactNode;
  // `compact` is the heading of a page of plain `Card`s (`text-sm font-semibold`, the pattern in
  // docs/ENGINEERING_RULES_FRONTEND.md § Alignment and cards); the default keeps the larger one.
  readonly size?: 'default' | 'compact';
}

export function SectionCard({
  title,
  children,
  size = 'default',
}: SectionCardProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-5 p-5 lg:p-6">
        <h2
          className={cn(
            'text-gray-900',
            size === 'compact' ? 'text-sm font-semibold' : 'text-base font-bold',
          )}
        >
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}
