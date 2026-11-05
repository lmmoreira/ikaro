import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

interface ConfigTextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
}

export function ConfigTextField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: ConfigTextFieldProps): React.JSX.Element {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
