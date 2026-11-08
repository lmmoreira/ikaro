import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-border bg-background shadow-sm hover:bg-muted hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90',
        // A white, borderless secondary action beside a primary one (the booking action rails).
        surface: 'border-0 bg-background text-foreground shadow-sm hover:bg-muted',
        // A destructive action that is not the primary one (reject beside approve).
        'destructive-outline':
          'border border-red-200 bg-background text-red-700 shadow-sm hover:bg-red-50 hover:text-red-700',
        ghost: 'text-primary hover:bg-accent hover:text-accent-foreground',
        // The neutral ghost: an icon or toolbar action that is not the page's accent colour.
        'ghost-muted': 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // The red and the gray sibling of `link`, for an inline "Remove" or "Close" text action.
        'link-destructive': 'text-destructive underline-offset-4 hover:underline',
        'link-muted': 'text-muted-foreground underline-offset-4 hover:text-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8 p-0',
        // A text action that sits inside a row or a paragraph, so it takes no height or padding.
        inline: 'h-auto p-0 font-semibold',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonProps = Readonly<
  React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
