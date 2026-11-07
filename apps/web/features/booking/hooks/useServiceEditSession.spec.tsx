// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceRequirementItem, StaffServiceResponse } from '@ikaro/types';
import { makeStaffService } from '@/features/booking/services/staff-service.fixture';
import type { ServiceTabAction } from '@/features/booking/types/service';
import { ApiError } from '@/shared/lib/api/errors';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useServiceEditSession } from './useServiceEditSession';

const mockActivateService = vi.fn();
const mockSetServiceStatus = vi.fn();
let topbarProvided = true;

vi.mock('@/features/booking/services/useServices', () => ({
  useActivateService: () => ({ mutateAsync: mockActivateService, isPending: false }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () =>
    topbarProvided ? { setServiceStatus: mockSetServiceStatus } : null,
}));

vi.mock('@/shared/lib/i18n/use-resolved-locale', () => ({ useResolvedLocale: () => 'pt-BR' }));

function action(label: string): ServiceTabAction {
  return { label, disabled: false, pending: false, onSubmit: vi.fn(), feedback: null };
}

function renderSession(service: StaffServiceResponse = makeStaffService()) {
  const dismissCreatedNotice = vi.fn();
  const view = renderHook(() => {
    const feedback = useFormFeedback();
    const session = useServiceEditSession({ service, feedback, dismissCreatedNotice });
    return { feedback, session };
  });
  return { ...view, dismissCreatedNotice };
}

describe('useServiceEditSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    topbarProvided = true;
  });

  it('starts on Detalhes with nothing dirty and the facts taken from the service', () => {
    const requirements: ResourceRequirementItem[] = [];
    const { result } = renderSession(makeStaffService({ resourceRequirements: requirements }));

    expect(result.current.session.activeTab).toBe('detalhes');
    expect(result.current.session.anyDirty).toBe(false);
    expect(Object.values(result.current.session.dirty).some(Boolean)).toBe(false);
    expect(result.current.session.isActive).toBe(true);
    expect(result.current.session.hasLegs).toBe(false);
    expect(result.current.session.savedRequirements).toBe(requirements);
  });

  it('knows a service with legs from the start, and an inactive one', () => {
    const { result } = renderSession(makeStaffService({ isActive: false, legs: [] }));

    expect(result.current.session.hasLegs).toBe(true);
    expect(result.current.session.isActive).toBe(false);
  });

  it('switches the open tab', () => {
    const { result } = renderSession();

    act(() => result.current.session.setActiveTab('politicas'));

    expect(result.current.session.activeTab).toBe('politicas');
  });

  it('marks a tab dirty, dismisses the created notice and reports anyDirty', () => {
    const { result, dismissCreatedNotice } = renderSession();

    act(() => result.current.session.setTabDirty('recursos', true));

    expect(result.current.session.dirty.recursos).toBe(true);
    expect(result.current.session.anyDirty).toBe(true);
    expect(dismissCreatedNotice).toHaveBeenCalledTimes(1);

    act(() => result.current.session.setTabDirty('recursos', false));
    expect(result.current.session.anyDirty).toBe(false);
  });

  it('keeps the same dirty object when a report changes nothing', () => {
    const { result } = renderSession();
    act(() => result.current.session.setTabDirty('pagina', true));
    const before = result.current.session.dirty;

    act(() => result.current.session.setTabDirty('pagina', true));

    expect(result.current.session.dirty).toBe(before);
  });

  it('stores a registered tab action per tab and clears it with null', () => {
    const { result } = renderSession();
    const recursos = action('Salvar');

    act(() => result.current.session.handleTabActionChange('recursos', recursos));
    expect(result.current.session.tabActions.recursos).toBe(recursos);

    act(() => result.current.session.handleTabActionChange('recursos', null));
    expect(result.current.session.tabActions.recursos).toBeNull();
  });

  it('keeps the same tabActions object when the same action is registered again', () => {
    const { result } = renderSession();
    const recursos = action('Salvar');
    act(() => result.current.session.handleTabActionChange('recursos', recursos));
    const before = result.current.session.tabActions;

    act(() => result.current.session.handleTabActionChange('recursos', recursos));

    expect(result.current.session.tabActions).toBe(before);
  });

  it('keeps one handleTabActionChange identity across renders', () => {
    const { result, rerender } = renderSession();
    const before = result.current.session.handleTabActionChange;

    rerender();

    expect(result.current.session.handleTabActionChange).toBe(before);
  });

  it('records that legs were saved and the requirements last saved', () => {
    const { result } = renderSession();
    const requirements: ResourceRequirementItem[] = [];

    act(() => result.current.session.markHasLegs());
    act(() => result.current.session.setSavedRequirements(requirements));

    expect(result.current.session.hasLegs).toBe(true);
    expect(result.current.session.savedRequirements).toBe(requirements);
  });

  it('activates the service: clears the feedback first, then turns it active', async () => {
    mockActivateService.mockResolvedValue(undefined);
    const { result } = renderSession(makeStaffService({ isActive: false }));
    act(() => result.current.feedback.setError('old'));

    await act(async () => result.current.session.activate());

    expect(mockActivateService).toHaveBeenCalledWith('svc-1');
    expect(result.current.session.isActive).toBe(true);
    expect(result.current.feedback.error).toBeNull();
    expect(result.current.session.isActivating).toBe(false);
  });

  it('routes an activation failure to the feedback and stays inactive', async () => {
    mockActivateService.mockRejectedValue(new ApiError(500, 'Internal error'));
    const { result } = renderSession(makeStaffService({ isActive: false }));

    await act(async () => result.current.session.activate());

    expect(result.current.session.isActive).toBe(false);
    expect(result.current.feedback.error).toBeTruthy();
    expect(result.current.session.isActivating).toBe(false);
  });

  it('is activating while the request is in flight', async () => {
    let finish: () => void = () => undefined;
    mockActivateService.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderSession(makeStaffService({ isActive: false }));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.session.activate();
    });
    expect(result.current.session.isActivating).toBe(true);

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.session.isActivating).toBe(false);
  });

  it('shows the topbar status for the service and follows an activation', async () => {
    mockActivateService.mockResolvedValue(undefined);
    const { result } = renderSession(makeStaffService({ isActive: false }));
    expect(mockSetServiceStatus).toHaveBeenLastCalledWith('INACTIVE');

    await act(async () => result.current.session.activate());

    expect(mockSetServiceStatus).toHaveBeenLastCalledWith('ACTIVE');
  });

  it('works without a topbar status provider', () => {
    topbarProvided = false;

    const { result } = renderSession();

    expect(result.current.session.isActive).toBe(true);
    expect(mockSetServiceStatus).not.toHaveBeenCalled();
  });
});
