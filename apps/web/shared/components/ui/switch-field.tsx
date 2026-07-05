'use client';

interface SwitchFieldProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly hint?: string;
  readonly testId?: string;
}

// Labeled toggle switch — shared visual pattern for boolean settings across the dashboard
// (first used inline in ServiceCreatePage's "Criar como ativo" toggle; extracted here on its
// second use to avoid a third copy-pasted instance).
export function SwitchField({
  checked,
  onChange,
  label,
  hint,
  testId,
}: SwitchFieldProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      data-testid={testId}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
    >
      <span className="pr-4">
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-gray-500">{hint}</span>}
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
