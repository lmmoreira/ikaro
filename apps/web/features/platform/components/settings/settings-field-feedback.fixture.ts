import type { SettingsFieldFeedback } from './SettingsFormFields';

/**
 * A `SettingsFieldFeedback` with the given field errors, for specs that render one section or
 * field without the form's `useFormFeedback`. The message id of a field is `<name>-error`.
 */
export function settingsFeedback(errors: Record<string, string> = {}): SettingsFieldFeedback {
  return {
    fieldErrors: errors,
    fieldErrorId: (name) => `${name}-error`,
    fieldProps: (name) => ({
      ref: () => undefined,
      'aria-invalid': errors[name] ? true : undefined,
      'aria-describedby': errors[name] ? `${name}-error` : undefined,
    }),
  };
}
