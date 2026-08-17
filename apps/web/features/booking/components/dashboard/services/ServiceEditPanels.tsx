import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

interface ServiceEditStatusSectionProps {
  readonly isActive: boolean;
  readonly serviceId: string;
}

export function ServiceEditStatusSection({
  isActive,
  serviceId,
}: ServiceEditStatusSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  if (isActive) {
    return (
      <section className="space-y-3 border-t border-red-200 pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-red-500">
          {t('editDangerZoneTitle')}
        </p>
        <p className="text-sm leading-6 text-gray-600">{t('editDangerZoneDescription')}</p>
        <Button asChild variant="destructive" className="w-full sm:w-auto">
          <Link
            data-testid="service-deactivate-link"
            href={`/dashboard/services/${serviceId}/deactivate`}
          >
            {t('editDeactivate')}
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-slate-500">
        {t('editInactiveTitle')}
      </p>
      <p className="text-sm leading-6 text-gray-600">{t('editInactiveDescription')}</p>
    </section>
  );
}

interface ServiceEditActionPanelsProps {
  readonly isActive: boolean;
  readonly isSubmitting: boolean;
  readonly isActivating: boolean;
  readonly onActivate: () => void;
}

interface ServiceEditPrimaryActionProps extends ServiceEditActionPanelsProps {
  readonly saveTestId: string;
  readonly activateTestId: string;
}

function ServiceEditPrimaryAction({
  isActive,
  isSubmitting,
  isActivating,
  onActivate,
  saveTestId,
  activateTestId,
}: ServiceEditPrimaryActionProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const commonT = useTranslations('common');

  if (isActive) {
    return (
      <Button type="submit" data-testid={saveTestId} className="w-full" disabled={isSubmitting}>
        {isSubmitting ? commonT('loading') : t('editSave')}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      data-testid={activateTestId}
      className="w-full"
      disabled={isActivating}
      onClick={onActivate}
    >
      {isActivating ? commonT('loading') : t('editActivate')}
    </Button>
  );
}

export function ServiceEditActionPanels({
  isActive,
  isSubmitting,
  isActivating,
  onActivate,
}: ServiceEditActionPanelsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <>
      <aside className="hidden lg:block lg:sticky lg:top-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            {!isActive && (
              <p className="text-sm leading-6 text-gray-600">{t('editInactiveDescription')}</p>
            )}

            <ServiceEditPrimaryAction
              isActive={isActive}
              isSubmitting={isSubmitting}
              isActivating={isActivating}
              onActivate={onActivate}
              saveTestId="service-desktop-save-button"
              activateTestId="service-desktop-activate-button"
            />

            <Button asChild variant="outline" className="w-full">
              <Link data-testid="service-cancel-desktop-link" href="/dashboard/services">
                {t('createCancel')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link data-testid="service-cancel-mobile-link" href="/dashboard/services">
              {t('createCancel')}
            </Link>
          </Button>
          <ServiceEditPrimaryAction
            isActive={isActive}
            isSubmitting={isSubmitting}
            isActivating={isActivating}
            onActivate={onActivate}
            saveTestId="service-mobile-save-button"
            activateTestId="service-mobile-activate-button"
          />
        </div>
      </div>
    </>
  );
}
