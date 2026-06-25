'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchStaffTenants, switchStaffTenant, StaffTenantOption } from '@/lib/api/auth';

export default function SelectStaffTenantPage() {
  const t = useTranslations('auth');
  const router = useRouter();

  const [options, setOptions] = useState<StaffTenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    fetchStaffTenants()
      .then((data) => {
        setOptions(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const select = async (staffId: string) => {
    setSelecting(staffId);
    try {
      await switchStaffTenant(staffId);
      router.push('/dashboard');
    } catch {
      setSelecting(null);
      setError(true);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-xl bg-white p-9 shadow-sm">
        <h1 className="mb-1.5 text-xl font-bold text-gray-900">{t('selectTenantHeading')}</h1>
        <p className="mb-6 text-sm text-gray-500">{t('selectTenantSubtitle')}</p>

        {loading && (
          <p className="py-6 text-center text-sm text-gray-400">{t('selectTenantLoading')}</p>
        )}

        {!loading && error && (
          <div className="text-center">
            <p className="mb-4 text-sm text-red-600">{t('selectTenantError')}</p>
            <a href="/dashboard" className="text-sm text-indigo-600 underline">
              {t('selectTenantRetry')}
            </a>
          </div>
        )}

        {!loading && !error && (
          <ul className="flex flex-col gap-3">
            {options.map((opt) => (
              <li key={opt.staffId}>
                <button
                  onClick={() => select(opt.staffId)}
                  disabled={selecting !== null}
                  className={`flex w-full items-center justify-between rounded-lg border border-gray-200 px-5 py-4 text-left transition-colors ${selecting === opt.staffId ? 'bg-gray-100' : 'bg-white hover:bg-gray-50'} ${selecting === null ? 'cursor-pointer' : 'cursor-wait'}`}
                >
                  <span className="font-medium text-gray-900">{opt.tenantName}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      opt.role === 'MANAGER'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {opt.role === 'MANAGER' ? t('roleManager') : t('roleStaff')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
