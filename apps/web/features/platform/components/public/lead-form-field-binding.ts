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

/** The feedback field name of a question (the contact fields use `name`, `email`, `phone`). */
export function questionFieldName(questionId: string): string {
  return `question:${questionId}`;
}

export function leadFormControlClass(base: string, binding?: LeadFormFieldBinding): string {
  return binding?.['aria-invalid'] ? `${base} ${BRANDED_FIELD_INVALID_CLASS}` : base;
}
