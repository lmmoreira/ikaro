'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { configureBffClient } from '@/lib/api/bff-client';

interface QueryProviderProps {
  readonly children: React.ReactNode;
  readonly token?: string;
  readonly tenantSlug?: string;
  readonly tenantId?: string;
}

export function QueryProvider({
  children,
  token = '',
  tenantSlug = '',
  tenantId = '',
}: QueryProviderProps) {
  configureBffClient({ token, tenantSlug, tenantId });

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
