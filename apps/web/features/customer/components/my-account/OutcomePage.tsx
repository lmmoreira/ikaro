'use client';

import Link from 'next/link';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { digitsOnly } from '@/shared/utils/digits-only';

export interface OutcomeAction {
  readonly label: string;
  readonly href: string;
  /** Opens in a new tab (a WhatsApp link). */
  readonly external?: boolean;
  readonly testId?: string;
}

/** The "contact via WhatsApp" link, or nothing when the business has no number. */
export function whatsappAction(label: string, whatsapp: string | null): OutcomeAction | undefined {
  return whatsapp === null
    ? undefined
    : { label, href: `https://wa.me/${digitsOnly(whatsapp)}`, external: true };
}

interface OutcomePageProps {
  readonly testId?: string;
  /** The page-level message (a `FeedbackMessage`), first in the column and level with the pane. */
  readonly message: React.ReactNode;
  readonly children?: React.ReactNode;
  readonly primary: OutcomeAction;
  readonly secondary?: OutcomeAction;
}

function ActionLink({
  action,
  variant,
}: Readonly<{ action: OutcomeAction; variant: 'default' | 'outline' }>): React.JSX.Element {
  return (
    <Button asChild variant={variant} className="w-full">
      {action.external ? (
        <a href={action.href} target="_blank" rel="noopener noreferrer" data-testid={action.testId}>
          {action.label}
        </a>
      ) : (
        <Link href={action.href} data-testid={action.testId}>
          {action.label}
        </Link>
      )}
    </Button>
  );
}

/**
 * A customer-account screen that reports how something ended and offers the way on: the result
 * as a page-level message, the facts in cards, and one or two links in the action pane (the
 * fixed bar on mobile). It has no form, so the pane carries no message of its own.
 */
export function OutcomePage({
  testId,
  message,
  children,
  primary,
  secondary,
}: OutcomePageProps): React.JSX.Element {
  const primaryLink = <ActionLink action={primary} variant="default" />;
  const secondaryLink =
    secondary === undefined ? null : <ActionLink action={secondary} variant="outline" />;

  return (
    <div className="w-full pb-40 lg:pb-0" data-testid={testId}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {message}
          {children}
        </div>

        <ActionPane
          actions={
            <>
              {primaryLink}
              {secondaryLink}
            </>
          }
          mobileActions={
            secondaryLink === null ? (
              primaryLink
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {secondaryLink}
                {primaryLink}
              </div>
            )
          }
        />
      </div>
    </div>
  );
}
