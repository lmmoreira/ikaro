'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/shared/utils/cn';

// Ported from shadcn/ui's `tabs` (new-york, Radix) — the Root/List/Trigger/Content split and the
// forwardRef wrappers are the upstream shape. Two deliberate adaptations: the dashboard looks
// (`underline`, `segmented`) replace upstream's single muted-pill look, and the variant reaches
// the triggers through a context so a call site sets it once, on the list.

export type TabsVariant = 'underline' | 'segmented';

const TabsVariantContext = React.createContext<TabsVariant>('underline');

const LIST_CLASSES: Record<TabsVariant, string> = {
  underline: 'flex gap-1 border-b border-gray-200',
  segmented: 'flex gap-1 rounded-lg bg-gray-100 p-1',
};

const TRIGGER_CLASSES: Record<TabsVariant, string> = {
  underline:
    'relative shrink-0 rounded-t-md border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:-ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  segmented:
    'flex-1 rounded-md px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
};

const Tabs = TabsPrimitive.Root;

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  readonly variant?: TabsVariant;
};

const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, variant = 'underline', ...props }, ref) => (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List ref={ref} className={cn(LIST_CLASSES[variant], className)} {...props} />
    </TabsVariantContext.Provider>
  ),
);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(TRIGGER_CLASSES[variant], className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // `forceMount` keeps an inactive panel in the DOM and Radix then leaves it visible, so the
      // inactive state is hidden here; a caller that needs the `hidden` attribute adds it too.
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=inactive]:hidden',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
