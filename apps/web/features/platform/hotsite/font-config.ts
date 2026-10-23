import {
  Inter,
  Poppins,
  Playfair_Display,
  Montserrat,
  Raleway,
  Oswald,
  Lato,
  Roboto,
  Manrope,
  DM_Sans,
} from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
});
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',
});
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat' });
const raleway = Raleway({ subsets: ['latin'], variable: '--font-raleway' });
const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald' });
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-lato' });
const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
});
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const FONT_VARIABLES: string[] = [
  inter.variable,
  poppins.variable,
  playfairDisplay.variable,
  montserrat.variable,
  raleway.variable,
  oswald.variable,
  lato.variable,
  roboto.variable,
  manrope.variable,
  dmSans.variable,
];

export const FONT_MAP: Record<string, string> = {
  Inter: 'var(--font-inter)',
  Poppins: 'var(--font-poppins)',
  'Playfair Display': 'var(--font-playfair-display)',
  Montserrat: 'var(--font-montserrat)',
  Raleway: 'var(--font-raleway)',
  Oswald: 'var(--font-oswald)',
  Lato: 'var(--font-lato)',
  Roboto: 'var(--font-roboto)',
  Manrope: 'var(--font-manrope)',
  'DM Sans': 'var(--font-dm-sans)',
};

export const FONT_CLASS_MAP: Record<string, string> = {
  Inter: inter.variable,
  Poppins: poppins.variable,
  'Playfair Display': playfairDisplay.variable,
  Montserrat: montserrat.variable,
  Raleway: raleway.variable,
  Oswald: oswald.variable,
  Lato: lato.variable,
  Roboto: roboto.variable,
  Manrope: manrope.variable,
  'DM Sans': dmSans.variable,
};

const DEFAULT_FONT = 'Inter';

export function getActiveFontVariables(heading: string, body: string): string[] {
  const resolve = (name: string) => FONT_CLASS_MAP[name] ?? FONT_CLASS_MAP[DEFAULT_FONT];
  return [...new Set([heading, body].map(resolve))].filter(Boolean);
}
