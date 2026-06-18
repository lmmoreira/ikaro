import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ikaro',
  description: 'Agendamento de lavagem automotiva',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
