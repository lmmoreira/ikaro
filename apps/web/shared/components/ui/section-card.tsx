import { Card, CardContent } from '@/shared/components/ui/card';

interface SectionCardProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

export function SectionCard({ title, children }: SectionCardProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-5 p-5 lg:p-6">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}
