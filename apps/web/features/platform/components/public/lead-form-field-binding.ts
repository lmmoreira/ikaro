import { BRANDED_FIELD_INVALID_CLASS } from '@/shared/components/hotsite/branded-field-feedback';

/**
 * What `useFormFeedback().fieldProps(name)` returns for one field: the focus registration and the
 * accessibility attributes an input gets when the form marks it invalid.
 */
export interface LeadFormFieldBinding {
  readonly ref?: (element: HTMLElement | null) => void;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
}

export function leadFormControlClass(base: string, binding?: LeadFormFieldBinding): string {
  return binding?.['aria-invalid'] ? `${base} ${BRANDED_FIELD_INVALID_CLASS}` : base;
}
