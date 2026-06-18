import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Não encontrado — Ikaro',
};

export default function HotsiteNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-4 text-3xl font-bold">Lavacar não encontrada</h1>
      <p className="mb-8 text-gray-600">
        A lavacar que você está procurando não existe ou não está mais disponível.
      </p>
      <a href="https://<ikaro-domain>" className="text-blue-600 underline">
        Voltar para o Ikaro
      </a>
    </main>
  );
}
