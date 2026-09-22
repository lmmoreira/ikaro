import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';

interface TimeSelectFieldProps {
  readonly label: ReactNode;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly string[];
  readonly placeholder: string;
  readonly portalContainer: HTMLElement | null;
}

export function TimeSelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  portalContainer,
}: TimeSelectFieldProps): React.JSX.Element {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent container={portalContainer}>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
