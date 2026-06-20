// Allow CSS module imports in TypeScript
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

// Type-safe next-intl translations keyed from the pt-BR locale file
import type webMessages from '@ikaro/i18n/locales/pt-BR/web.json';
type Messages = typeof webMessages;
declare global {
  interface IntlMessages extends Messages {}
}
