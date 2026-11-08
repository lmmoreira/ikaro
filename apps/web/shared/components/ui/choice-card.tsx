import * as React from 'react';
import { cn } from '@/shared/utils/cn';

type ChoiceCardProps = Readonly<
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'type'> & {
    /** Whether this card is the chosen option; drives `aria-pressed` and the blue look. */
    selected: boolean;
  }
>;

// A selectable card: a title and a hint inside a bordered button, one of a few mutually
// exclusive options laid out in a grid ("Hora marcada" / "Sessão", "Fixo" / "Por etapas", a role).
// It is a toggle button (`aria-pressed`), not a radio, so a spec finds it by `getByRole('button')`
// and its test id. The shades that no token matches exactly (`blue-500`, `slate-200`) stay on the
// palette so the four cards this was extracted from render unchanged; a wrapping `<label>` radio
// drawn as a card is `ui/radio`.
export const ChoiceCard = React.forwardRef<HTMLButtonElement, ChoiceCardProps>(
  ({ selected, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        selected ? 'border-blue-500 bg-accent' : 'border-slate-200 hover:bg-slate-50',
        className,
      )}
      {...props}
    />
  ),
);
ChoiceCard.displayName = 'ChoiceCard';
