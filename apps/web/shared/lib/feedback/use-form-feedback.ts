'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import { resolveApiErrorFeedback } from '@/shared/lib/i18n/resolve-error-message';

const FOCUSABLE_SELECTOR =
  'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

type FieldErrors = Readonly<Record<string, string>>;
type FieldRef = (element: HTMLElement | null) => void;

function focusTarget(element: HTMLElement): HTMLElement | null {
  return element.matches(FOCUSABLE_SELECTOR)
    ? element
    : element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

function inDocumentOrder(a: HTMLElement, b: HTMLElement): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function useFieldRegistry() {
  const fields = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, FieldRef>());

  const registerField = useCallback((name: string): FieldRef => {
    const known = refs.current.get(name);
    if (known) return known;

    const ref: FieldRef = (element) => {
      if (element) fields.current.set(name, element);
      else fields.current.delete(name);
    };
    refs.current.set(name, ref);
    return ref;
  }, []);

  const isRegistered = useCallback((name: string) => fields.current.has(name), []);

  const focusFirstOf = useCallback((names: readonly string[]) => {
    const [first] = names
      .map((name) => fields.current.get(name))
      .filter((element): element is HTMLElement => element !== undefined)
      .sort(inDocumentOrder);
    if (!first) return;

    first.scrollIntoView({ block: 'center' });
    focusTarget(first)?.focus({ preventScroll: true });
  }, []);

  return { registerField, isRegistered, focusFirstOf };
}

function useMessages() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const setError = useCallback((message: string) => {
    setSuccessMessage(null);
    setErrorMessage(message);
  }, []);

  const setSuccess = useCallback((message: string) => {
    setErrorMessage(null);
    setSuccessMessage(message);
  }, []);

  const clear = useCallback(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, []);

  const feedback = useMemo<FeedbackModel | null>(() => {
    if (errorMessage) return { variant: 'error', title: errorMessage };
    if (successMessage) return { variant: 'success', title: successMessage };
    return null;
  }, [errorMessage, successMessage]);

  return { error: errorMessage, success: successMessage, feedback, setError, setSuccess, clear };
}

function useFieldErrors(registry: ReturnType<typeof useFieldRegistry>) {
  const formId = useId();
  const [errorsByField, setErrorsByField] = useState<FieldErrors>({});
  const latest = useRef<FieldErrors>({});
  const { registerField, focusFirstOf } = registry;

  const replace = useCallback((errors: FieldErrors) => {
    latest.current = errors;
    setErrorsByField(errors);
  }, []);

  const focusFirstInvalid = useCallback(
    () => focusFirstOf(Object.keys(latest.current)),
    [focusFirstOf],
  );

  const setFieldErrors = useCallback(
    (errors: FieldErrors) => {
      replace(errors);
      focusFirstInvalid();
    },
    [replace, focusFirstInvalid],
  );

  const fieldErrorId = useCallback((name: string) => `${formId}-${name}-error`, [formId]);

  const fieldProps = useCallback(
    (name: string) => ({
      ref: registerField(name),
      'aria-invalid': errorsByField[name] ? (true as const) : undefined,
      'aria-describedby': errorsByField[name] ? fieldErrorId(name) : undefined,
    }),
    [errorsByField, fieldErrorId, registerField],
  );

  return {
    fieldErrors: errorsByField,
    replace,
    setFieldErrors,
    focusFirstInvalid,
    fieldErrorId,
    fieldProps,
  };
}

function useFormActions(
  registry: ReturnType<typeof useFieldRegistry>,
  messages: ReturnType<typeof useMessages>,
  fields: ReturnType<typeof useFieldErrors>,
) {
  const { replace, setFieldErrors } = fields;
  const { setError, setSuccess: showSuccess, clear: clearMessages } = messages;
  const { isRegistered } = registry;

  const clear = useCallback(() => {
    clearMessages();
    replace({});
  }, [clearMessages, replace]);

  const setSuccess = useCallback(
    (message: string) => {
      replace({});
      showSuccess(message);
    },
    [replace, showSuccess],
  );

  const setFromApiError = useCallback(
    (err: unknown, locale: SupportedLocale) => {
      const { message, field } = resolveApiErrorFeedback(err, locale);
      setError(message);
      if (field && isRegistered(field)) setFieldErrors({ [field]: message });
      else replace({});
    },
    [isRegistered, replace, setError, setFieldErrors],
  );

  return { clear, setSuccess, setFromApiError };
}

export function useFormFeedback() {
  const registry = useFieldRegistry();
  const messages = useMessages();
  const fields = useFieldErrors(registry);
  const actions = useFormActions(registry, messages, fields);

  return {
    error: messages.error,
    success: messages.success,
    feedback: messages.feedback,
    setError: messages.setError,
    fieldErrors: fields.fieldErrors,
    fieldProps: fields.fieldProps,
    fieldErrorId: fields.fieldErrorId,
    focusFirstInvalid: fields.focusFirstInvalid,
    setFieldErrors: fields.setFieldErrors,
    registerField: registry.registerField,
    ...actions,
  };
}
