import { Card } from '@/shared/components/ui/card';

interface DetailSectionProps {
  readonly title: string;
  readonly testId?: string;
  readonly children: React.ReactNode;
}

/**
 * One titled box of a customer detail screen. The heading lives inside the card, so the first box
 * starts level with the action pane beside it (`docs/ENGINEERING_RULES_FRONTEND.md` § Alignment and cards).
 */
export function DetailSection({ title, testId, children }: DetailSectionProps): React.JSX.Element {
  return (
    <Card className="rounded-xl border-gray-100 p-4 shadow-none" data-testid={testId}>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </Card>
  );
}
