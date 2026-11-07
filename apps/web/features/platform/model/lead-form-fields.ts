/** The answers a visitor has given, by question id: a text, one choice, or several choices. */
export type LeadFormAnswers = Record<string, string | string[]>;

/** The feedback field name of a question (the contact fields use `name`, `email`, `phone`). */
export function questionFieldName(questionId: string): string {
  return `question:${questionId}`;
}
