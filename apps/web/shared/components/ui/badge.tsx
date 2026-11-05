import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        // Borderless tinted chips for a fixed meaning. A chip whose colour comes from data (a
        // status or type map) still passes its own `className`.
        neutral: 'border-0 bg-gray-100 text-gray-600',
        info: 'border-0 bg-blue-100 text-blue-800',
        success: 'border-0 bg-green-100 text-green-800',
        warning: 'border-0 bg-orange-100 text-orange-800',
      },
      size: {
        default: '',
        sm: 'text-[0.6875rem]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type BadgeProps = Readonly<
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>
>;

export function Badge({ className, variant, size, ...props }: BadgeProps): React.JSX.Element {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
