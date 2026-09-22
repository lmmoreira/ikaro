// Replaces next/font/google in the Vitest environment.
// The real module writes font metadata to disk during Next.js build — unusable in tests.
// Curried (id) => () => {...}, not a plain object: real next/font/google exports are callable
// (e.g. Inter({ subsets: ['latin'] })), so a mock export must stay callable too, or a component
// invoking it as a function would throw against the mock while working fine against the real one.
const font = (id: string) => (): { variable: string; className: string } => ({
  variable: `--font-${id}`,
  className: `font-${id}`,
});

export const Inter = font('inter');
export const Poppins = font('poppins');
export const Playfair_Display = font('playfair-display');
export const Montserrat = font('montserrat');
export const Raleway = font('raleway');
export const Oswald = font('oswald');
export const Lato = font('lato');
export const Roboto = font('roboto');
