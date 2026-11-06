'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/shared/utils/cn';

// Ported from shadcn/ui's `dialog` (new-york, Radix) — the Root/Portal/Overlay/Content/Title/
// Description split and the forwardRef wrappers are the upstream shape. Deliberate adaptations:
// - no built-in "X / Close" button: upstream hardcodes an English `sr-only` label, so a caller
//   composes `DialogClose` with its own translated label instead;
// - no `tailwindcss-animate` classes (the plugin is not installed in this app);
// - the stacking order matches `ui/alert-dialog` (`z-[70]`), the repo's other modal primitive.
// `ui/alert-dialog` stays the primitive for confirmations; this one is for a dialog that holds a
// form or read-only content and may be dismissed by Escape or a backdrop click.

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-[70] bg-black/50', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  readonly overlayClassName?: string;
  readonly overlayTestId?: string;
};

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, overlayClassName, overlayTestId, onOpenAutoFocus, onCloseAutoFocus, ...props },
    ref,
  ) => {
    // Radix returns focus on close only to a `DialogTrigger`. A dialog opened from state (a sheet
    // mounted by its parent, a button that is not a trigger) would drop focus on <body>, so the
    // element that had focus when the dialog opened is remembered and given focus back.
    const openerRef = React.useRef<HTMLElement | null>(null);

    return (
      <DialogPortal>
        <DialogOverlay className={overlayClassName} data-testid={overlayTestId} />
        <DialogPrimitive.Content
          ref={ref}
          // Radix hides everything outside a modal from assistive tech but leaves this attribute
          // off; the native action sheets this replaces exposed it, and it is valid on role="dialog".
          aria-modal="true"
          className={cn(
            'fixed left-1/2 top-1/2 z-[70] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-gray-200 bg-white p-6 text-gray-950 shadow-lg outline-none',
            className,
          )}
          {...props}
          onOpenAutoFocus={(event) => {
            openerRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) openerRef.current?.focus();
          }}
        />
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({
  className,
  ...props
}: Readonly<React.HTMLAttributes<HTMLDivElement>>): React.JSX.Element {
  return <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />;
}

function DialogFooter({
  className,
  ...props
}: Readonly<React.HTMLAttributes<HTMLDivElement>>): React.JSX.Element {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-sm font-semibold text-gray-900', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-gray-500', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
