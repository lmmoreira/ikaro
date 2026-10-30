// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffServiceResponse } from '@ikaro/types';
import { renderWithIntl, TabActionFeedback } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import type { ServiceTabAction } from './service-tab-action';
import { ServicePublicPageTab } from './ServicePublicPageTab';

const mutateAsync = vi.fn();
let role: 'MANAGER' | 'STAFF' = 'MANAGER';

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateServicePublicPage: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-1', tenantSlug: 'vitta', role }),
}));
vi.mock('@/features/platform/components/hotsite/SingleImageUploadField', () => ({
  SingleImageUploadField: (props: { id: string; value: string; onChange: (p: string) => void }) => (
    <button
      type="button"
      data-testid={`upload-${props.id}`}
      data-value={props.value}
      onClick={() => props.onChange('tmp/tenant-1/service-profile/u/new.webp')}
    >
      upload
    </button>
  ),
}));

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';

function makeService(overrides: Partial<StaffServiceResponse> = {}): StaffServiceResponse {
  return {
    serviceId: SERVICE_ID,
    name: 'Massagem',
    description: null,
    price: { amount: 120, currency: 'BRL' },
    durationMinutes: 60,
    loyaltyPointsValue: 8,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    bookingModel: 'APPOINTMENT',
    resourceRequirements: [],
    bufferAfterMinutes: null,
    tenantDefaultBufferMinutes: 60,
    legs: null,
    classResourceSlots: null,
    bookingPolicy: {
      defaultApprovalMode: null,
      manualHoldMinutes: null,
      cancellationWindowHoursOverride: null,
      rescheduleWindowHoursOverride: null,
      minBookingAdvanceHoursOverride: null,
      maxBookingAdvanceDaysOverride: null,
      effectiveMinBookingAdvanceHours: 0,
      effectiveMaxBookingAdvanceDays: 90,
      recurrenceEligible: false,
      recurringHorizonDays: null,
      availabilityAlertEligible: false,
      durationPolicy: 'FIXED',
      durationMinMinutes: null,
      durationMaxMinutes: null,
      durationIncrementMinutes: null,
      pricingPolicy: 'FIXED',
      pricingIncrementMinutes: null,
      pricePerIncrementAmount: null,
      minimumChargeAmount: null,
    },
    publicPagePublished: false,
    publicSlug: null,
    publicProfile: null,
    ...overrides,
  };
}

// Plays ServiceEditPage's role: the tab registers its save action instead of drawing a button.
function Harness({
  service,
  isActive = true,
  onDirtyChange,
}: {
  service: StaffServiceResponse;
  isActive?: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [action, setAction] = useState<ServiceTabAction | null>(null);
  return (
    <>
      <ServicePublicPageTab
        service={service}
        isActive={isActive}
        onDirtyChange={onDirtyChange}
        onActionChange={setAction}
      />
      <button
        type="button"
        data-testid="tab-save"
        disabled={action === null || action.disabled || action.pending}
        onClick={action?.onSubmit}
      >
        {action?.label}
      </button>
      <TabActionFeedback feedback={action?.feedback} />
    </>
  );
}

function renderTab(service = makeService(), extra: { isActive?: boolean } = {}) {
  const onDirtyChange = vi.fn();
  renderWithIntl(<Harness service={service} onDirtyChange={onDirtyChange} {...extra} />);
  return { onDirtyChange };
}

beforeEach(() => {
  mutateAsync.mockReset();
  role = 'MANAGER';
});

describe('ServicePublicPageTab', () => {
  it('registers a "Salvar página pública" action and starts clean', () => {
    const { onDirtyChange } = renderTab();

    expect(screen.getByTestId('tab-save')).toHaveTextContent('Salvar página pública');
    expect(onDirtyChange).not.toHaveBeenCalled();
  });

  it('starts from the stored state: switch, content and (live) link', () => {
    renderTab(
      makeService({
        publicPagePublished: true,
        publicSlug: 'massagem',
        publicProfile: {
          coverImageUrl: null,
          galleryImageUrls: [],
          longDescription: 'Texto salvo',
          inclusions: ['Chá'],
          preparationNotes: 'Cedo',
        },
      }),
    );

    expect(screen.getByTestId('public-page-switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('public-page-description')).toHaveValue('Texto salvo');
    expect(screen.getByTestId('public-page-inclusion')).toHaveValue('Chá');
    expect(screen.getByTestId('public-page-preparation')).toHaveValue('Cedo');
    expect(screen.getByTestId('public-page-view-link')).toHaveAttribute(
      'href',
      '/vitta/servicos/massagem',
    );
  });

  it('marks the tab dirty on the first edit and when the switch is flipped', async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = renderTab();

    await user.click(screen.getByTestId('public-page-switch'));

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('publishes: sends the switch and the whole profile, then the link goes live and the tab is clean', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      id: SERVICE_ID,
      publicPagePublished: true,
      publicSlug: 'massagem',
      publicProfile: {
        coverImageUrl: null,
        galleryImageUrls: [],
        longDescription: 'Uma pausa.',
        inclusions: ['Chá'],
        preparationNotes: null,
      },
    });
    const { onDirtyChange } = renderTab();

    await user.click(screen.getByTestId('public-page-switch'));
    await user.type(screen.getByTestId('public-page-description'), '  Uma pausa.  ');
    await user.click(screen.getByTestId('public-page-inclusion-add'));
    await user.type(screen.getByTestId('public-page-inclusion'), 'Chá');
    expect(screen.queryByTestId('public-page-view-link')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('tab-save'));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: SERVICE_ID,
      body: {
        published: true,
        profile: {
          coverImageUrl: null,
          galleryImageUrls: [],
          longDescription: 'Uma pausa.',
          inclusions: ['Chá'],
          preparationNotes: null,
        },
      },
    });
    expect(await screen.findByTestId('form-feedback')).toHaveTextContent(
      'A página pública do serviço foi atualizada.',
    );
    expect(screen.queryByTestId('public-page-saved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-page-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-page-view-link')).toHaveAttribute(
      'href',
      '/vitta/servicos/massagem',
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('never sends a slug — the system generates it', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      id: SERVICE_ID,
      publicPagePublished: true,
      publicSlug: 'massagem',
      publicProfile: null,
    });
    renderTab(makeService({ publicSlug: 'massagem' }));

    await user.click(screen.getByTestId('public-page-switch'));
    await user.click(screen.getByTestId('tab-save'));

    const { body } = mutateAsync.mock.calls[0][0];
    expect(Object.keys(body).sort()).toEqual(['profile', 'published']);
  });

  it('unpublishing disables the link again after the save', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      id: SERVICE_ID,
      publicPagePublished: false,
      publicSlug: 'massagem',
      publicProfile: null,
    });
    renderTab(makeService({ publicPagePublished: true, publicSlug: 'massagem' }));

    await user.click(screen.getByTestId('public-page-switch'));
    await user.click(screen.getByTestId('tab-save'));

    await waitFor(() =>
      expect(screen.queryByTestId('public-page-view-link')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('public-page-chip')).toHaveTextContent('Não publicada');
  });

  it('adopts the stored paths the backend returns (a tmp upload comes back permanent)', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({
      id: SERVICE_ID,
      publicPagePublished: false,
      publicSlug: null,
      publicProfile: {
        coverImageUrl: 'tenants/tenant-1/hotsite/service-profile/u/new.webp',
        galleryImageUrls: [],
        longDescription: null,
        inclusions: [],
        preparationNotes: null,
      },
    });
    renderTab();

    await user.click(screen.getByTestId('upload-service-page-cover'));
    expect(screen.getByTestId('upload-service-page-cover')).toHaveAttribute(
      'data-value',
      'tmp/tenant-1/service-profile/u/new.webp',
    );
    await user.click(screen.getByTestId('tab-save'));

    await waitFor(() =>
      expect(screen.getByTestId('upload-service-page-cover')).toHaveAttribute(
        'data-value',
        'tenants/tenant-1/hotsite/service-profile/u/new.webp',
      ),
    );
  });

  it('shows the localized error and stays dirty when the save fails', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(
      new ApiError(409, 'Conflict', { code: 'BOOKING_SERVICE_PUBLIC_SLUG_TAKEN' }),
    );
    const { onDirtyChange } = renderTab();

    await user.click(screen.getByTestId('public-page-switch'));
    await user.click(screen.getByTestId('tab-save'));

    expect(await screen.findByTestId('form-feedback')).toHaveTextContent(
      'Não foi possível publicar a página agora. Tente novamente.',
    );
    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId('form-feedback')).not.toHaveTextContent('Alterações salvas');
  });

  it('does not clear dirty for an edit made while the save was in flight', async () => {
    const user = userEvent.setup();
    let resolveSave: (value: unknown) => void = () => undefined;
    mutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { onDirtyChange } = renderTab();

    await user.click(screen.getByTestId('public-page-switch'));
    await user.click(screen.getByTestId('tab-save'));
    await user.type(screen.getByTestId('public-page-preparation'), 'x');
    await act(async () => {
      resolveSave({
        id: SERVICE_ID,
        publicPagePublished: true,
        publicSlug: 'massagem',
        publicProfile: null,
      });
    });

    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
  });

  describe('roles', () => {
    it('a manager can upload images', () => {
      renderTab();

      expect(screen.getByTestId('upload-service-page-cover')).toBeInTheDocument();
      expect(screen.queryByTestId('public-page-images-locked')).not.toBeInTheDocument();
    });

    it('STAFF cannot upload (images locked with a note) but can still publish and edit the text', async () => {
      const user = userEvent.setup();
      role = 'STAFF';
      mutateAsync.mockResolvedValue({
        id: SERVICE_ID,
        publicPagePublished: true,
        publicSlug: 'massagem',
        publicProfile: null,
      });
      renderTab();

      expect(screen.queryByTestId('upload-service-page-cover')).not.toBeInTheDocument();
      expect(screen.getByTestId('public-page-images-locked')).toBeVisible();

      await user.click(screen.getByTestId('public-page-switch'));
      await user.type(screen.getByTestId('public-page-description'), 'Texto da equipe');
      await user.click(screen.getByTestId('tab-save'));

      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(mutateAsync.mock.calls[0][0].body.published).toBe(true);
      expect(mutateAsync.mock.calls[0][0].body.profile.longDescription).toBe('Texto da equipe');
    });
  });

  it('tells the manager a deactivated service shows no page on the site', () => {
    renderTab(makeService({ isActive: false }), { isActive: false });

    expect(screen.getByTestId('public-page-inactive-note')).toBeVisible();
  });
});
