import type { useTranslations } from 'next-intl';
import type { LeadFormQuestion } from '@ikaro/types';
import { questionFieldName } from './lead-form-field-binding';

const CONTACT_FIELDS = ['name', 'email', 'phone'] as const;
const ANSWER_FIELD_PREFIX = 'answers.';

/**
 * The form field a server rejection names, as the feedback field it maps to with its message: a
 * contact field by its name, a required question by `answers.<questionId>` (the backend's format).
 * Null for a field the form does not have, so the caller falls back to the form-level message.
 */
export function serverFieldError(
  field: string | undefined,
  questions: readonly LeadFormQuestion[],
  t: ReturnType<typeof useTranslations>,
): Record<string, string> | null {
  if (!field) return null;

  const contact = CONTACT_FIELDS.find((name) => name === field);
  if (contact === 'email') return { email: t('leadForm.emailRequired') };
  if (contact === 'phone') return { phone: t('leadForm.phoneRequired') };
  if (contact === 'name') return { name: t('leadForm.nameRequired') };

  if (!field.startsWith(ANSWER_FIELD_PREFIX)) return null;
  const question = questions.find((q) => q.id === field.slice(ANSWER_FIELD_PREFIX.length));
  if (!question) return null;
  const message =
    question.type === 'TEXT' ? t('leadForm.questionRequired') : t('leadForm.selectOption');
  return { [questionFieldName(question.id)]: message };
}
