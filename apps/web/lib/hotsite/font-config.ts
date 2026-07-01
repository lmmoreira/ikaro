import {
  Inter,
  Poppins,
  Playfair_Display,
  Montserrat,
  Raleway,
  Oswald,
  Lato,
  Roboto,
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

export const FONT_VARIABLES: string[] = [
  inter.variable,
  poppins.variable,
  playfairDisplay.variable,
  montserrat.variable,
  raleway.variable,
  oswald.variable,
  lato.variable,
  roboto.variable,
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
};

export function getActiveFontVariables(heading: string, body: string): string[] {
  return [...new Set([heading, body])]
    .map((name) => FONT_CLASS_MAP[name])
    .filter(Boolean);
}
