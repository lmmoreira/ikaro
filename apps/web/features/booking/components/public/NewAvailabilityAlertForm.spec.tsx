// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailabilityAlertResponse,
  HotsiteServiceResourceOptionsResponse,
} from '@ikaro/types';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import { createAvailabilityAlert } from '@/features/booking/api/availability-alerts';
import { fetchServiceResourceOptions } from '@/features/booking/api/public';
import {
  NewAvailabilityAlertForm,
  type AvailabilityAlertFormService,
} from './NewAvailabilityAlertForm';

vi.mock('@/features/booking/api/availability-alerts', () => ({ createAvailabilityAlert: vi.fn() }));
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions: vi.fn() }));

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const RESOURCE_ID = '20000000-0000-4000-8000-000000000001';

const flatService: AvailabilityAlertFormService = {
  id: SERVICE_ID,
  name: 'Lavagem Simples',
  durationMinutes: 30,
  isComposite: false,
};

const resourceOptions: HotsiteServiceResourceOptionsResponse = {
  requirements: [
    {
      serviceId: SERVICE_ID,
      legIndex: null,
      resourceType: 'ROOM',
      selectionMode: 'CUSTOMER_CHOICE',
      requiredQuantity: 1,
      options: [
        { resourceId: RESOURCE_ID, name: 'Box 2' },
        { resourceId: '20000000-0000-4000-8000-000000000002', name: 'Box 1' },
      ],
    },
  ],
};

const created: AvailabilityAlertResponse = {
  id: '30000000-0000-4000-8000-000000000001',
  serviceId: SERVICE_ID,
  preferredResourceId: null,
  criteriaType: 'ONE_TIME_RANGE',
  timezone: 'America/Sao_Paulo',
  acceptableStartAt: '2099-10-20T12:00:00.000Z',
  acceptableEndAt: '2099-10-27T21:00:00.000Z',
  weekdays: null,
  localStartTime: null,
  localEndTime: null,
  durationMinutes: null,
  participantCount: null,
  status: 'ACTIVE',
  expiresAt: '2099-11-05T15:00:00.000Z',
  createdAt: '2099-10-06T15:00:00.000Z',
};

function renderForm(
  overrides: Partial<React.ComponentProps<typeof NewAvailabilityAlertForm>> = {},
  locale = 'pt-BR',
) {
  return renderWithIntl(
    <NewAvailabilityAlertForm
      slug="acme"
      service={flatService}
      preferredResourceId={null}
      durationMinutes={null}
      email="joao@email.com"
      {...overrides}
    />,
    { locale },
  );
}

function weekday(day: string): HTMLElement {
  const pill = screen.getAllByTestId('alert-weekday').find((el) => el.dataset.day === day);
  if (!pill) throw new Error(`no weekday pill for ${day}`);
  return pill;
}

type RangeRow = 'rangeFrom' | 'rangeTo';
type TimeRow = RangeRow | 'weeklyFrom' | 'weeklyTo';

function byRow(testId: string, row: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"][data-row-key="${row}"]`,
  );
  if (!found) throw new Error(`${testId} for ${row} not found`);
  return found;
}

// A day is picked from the shadcn Calendar popover, exactly as the leads date range does.
async function pickDate(row: RangeRow, isoDate: string): Promise<void> {
  await userEvent.click(byRow('alert-date', row));
  const cell = document.querySelector(`[data-day="${isoDate}"] button`);
  if (!cell) throw new Error(`day cell for ${isoDate} not found`);
  fireEvent.click(cell);
}

// An hour or minute is picked from the shared TimePicker's Radix select.
async function pickTime(row: TimeRow, part: 'hour' | 'minute', option: string): Promise<void> {
  await userEvent.click(byRow(`alert-time-${part}`, row));
  await userEvent.click(screen.getByRole('option', { name: option }));
}

async function fillRange(from = '2026-10-20', to = '2026-10-27'): Promise<void> {
  await pickDate('rangeFrom', from);
  await pickDate('rangeTo', to);
}

describe('NewAvailabilityAlertForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T15:00:00.000Z'));
    vi.mocked(createAvailabilityAlert).mockReset();
    vi.mocked(fetchServiceResourceOptions).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('what it shows from the booking flow', () => {
    it('shows the service and its duration, and no resource when none was picked', () => {
      renderForm();

      expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
      expect(screen.getByText('30 min')).toBeInTheDocument();
      expect(screen.queryByTestId('alert-resource')).not.toBeInTheDocument();
      expect(fetchServiceResourceOptions).not.toHaveBeenCalled();
    });

    it('prefers the duration chosen in the flow over the service default', () => {
      renderForm({ durationMinutes: 90 });

      expect(screen.getByText('90 min')).toBeInTheDocument();
    });

    it('shows the picked resource by name, read-only', async () => {
      vi.mocked(fetchServiceResourceOptions).mockResolvedValue(resourceOptions);
      renderForm({ preferredResourceId: RESOURCE_ID });

      expect(await screen.findByTestId('alert-resource')).toHaveTextContent('Box 2');
      expect(fetchServiceResourceOptions).toHaveBeenCalledWith('acme', SERVICE_ID);
      expect(screen.queryByRole('combobox', { name: /recurso/i })).not.toBeInTheDocument();
    });

    it('drops a resource id the service does not offer instead of sending it', async () => {
      vi.mocked(fetchServiceResourceOptions).mockResolvedValue(resourceOptions);
      vi.mocked(createAvailabilityAlert).mockResolvedValue(created);
      renderForm({ preferredResourceId: '20000000-0000-4000-8000-0000000000ff' });
      await waitFor(() => expect(screen.getByTestId('alert-submit')).toBeEnabled());

      await fillRange();
      await userEvent.click(screen.getByTestId('alert-submit'));

      await waitFor(() => expect(createAvailabilityAlert).toHaveBeenCalled());
      expect(vi.mocked(createAvailabilityAlert).mock.calls[0][0]).not.toHaveProperty(
        'preferredResourceId',
      );
    });

    it('fails closed when the options cannot be read: an error with a retry, and submit stays disabled', async () => {
      vi.mocked(fetchServiceResourceOptions).mockRejectedValue(new Error('boom'));
      renderForm({ preferredResourceId: RESOURCE_ID });

      expect(await screen.findByTestId('alert-resource-error')).toHaveTextContent(
        'Não foi possível carregar o recurso escolhido.',
      );
      expect(screen.getByTestId('alert-submit')).toBeDisabled();
      expect(screen.queryByTestId('alert-resource')).not.toBeInTheDocument();
    });

    it('lets the customer retry the resource lookup, then submit with the verified pick', async () => {
      vi.mocked(fetchServiceResourceOptions)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(resourceOptions);
      vi.mocked(createAvailabilityAlert).mockResolvedValue(created);
      renderForm({ preferredResourceId: RESOURCE_ID });
      await screen.findByTestId('alert-resource-error');

      await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(await screen.findByTestId('alert-resource')).toHaveTextContent('Box 2');
      expect(screen.queryByTestId('alert-resource-error')).not.toBeInTheDocument();
      await fillRange();
      await userEvent.click(screen.getByTestId('alert-submit'));
      await waitFor(() =>
        expect(createAvailabilityAlert).toHaveBeenCalledWith(
          expect.objectContaining({ preferredResourceId: RESOURCE_ID }),
        ),
      );
    });

    it('keeps submit disabled while the resource name is still loading', () => {
      vi.mocked(fetchServiceResourceOptions).mockReturnValue(new Promise(() => undefined));
      renderForm({ preferredResourceId: RESOURCE_ID });

      expect(screen.getByTestId('alert-submit')).toBeDisabled();
    });

    it('shows no resource and the note for a legged service, and never asks for options', () => {
      renderForm({
        service: { ...flatService, isComposite: true },
        preferredResourceId: RESOURCE_ID,
      });

      expect(screen.getByTestId('alert-composite-note')).toHaveTextContent(
        'Avisaremos quando a jornada inteira couber, com qualquer profissional ou sala.',
      );
      expect(screen.queryByTestId('alert-resource')).not.toBeInTheDocument();
      expect(fetchServiceResourceOptions).not.toHaveBeenCalled();
    });

    it('names the e-mail the alert will be sent to', () => {
      renderForm();

      expect(screen.getByText(/Avisaremos joao@email\.com\./)).toBeInTheDocument();
    });
  });

  describe('validation — nothing is sent while a field is wrong', () => {
    it('asks for the period when the range is empty', async () => {
      renderForm();

      await userEvent.click(screen.getByTestId('alert-submit'));

      expect(await screen.findByText('Informe o início do período.')).toBeInTheDocument();
      expect(createAvailabilityAlert).not.toHaveBeenCalled();
    });

    it('rejects an end that is before the start', async () => {
      renderForm();
      await fillRange('2026-10-27', '2026-10-20');

      await userEvent.click(screen.getByTestId('alert-submit'));

      expect(
        await screen.findByText('O fim do período precisa ser depois do início.'),
      ).toBeInTheDocument();
      expect(createAvailabilityAlert).not.toHaveBeenCalled();
    });

    it('rejects a period that ends earlier today — the Calendar never offers a past day', async () => {
      renderForm();
      await pickDate('rangeFrom', '2026-10-06');
      await pickDate('rangeTo', '2026-10-06');
      // Now is 12:00 in the tenant zone; the default 09:00 start, 11:00 end is already over.
      await pickTime('rangeTo', 'hour', '11');

      await userEvent.click(screen.getByTestId('alert-submit'));

      expect(await screen.findByText('O período precisa terminar no futuro.')).toBeInTheDocument();
      expect(createAvailabilityAlert).not.toHaveBeenCalled();
    });

    it('asks for a weekday and a later end time in weekly mode', async () => {
      renderForm();
      await userEvent.click(screen.getByTestId('criteria-weekly'));
      await pickTime('weeklyFrom', 'hour', '12');
      await pickTime('weeklyTo', 'hour', '09');

      await userEvent.click(screen.getByTestId('alert-submit'));

      expect(await screen.findByText('Escolha pelo menos um dia da semana.')).toBeInTheDocument();
      expect(
        screen.getByText('O horário final precisa ser depois do inicial.'),
      ).toBeInTheDocument();
      expect(createAvailabilityAlert).not.toHaveBeenCalled();
    });

    it('clears the errors as soon as the customer edits a field', async () => {
      renderForm();
      await userEvent.click(screen.getByTestId('alert-submit'));
      await screen.findByText('Informe o início do período.');

      await fillRange();

      expect(screen.queryByText('Informe o início do período.')).not.toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it("sends a one-time range in the tenant offset with the flow's resource and duration, then confirms", async () => {
      vi.mocked(fetchServiceResourceOptions).mockResolvedValue(resourceOptions);
      vi.mocked(createAvailabilityAlert).mockResolvedValue(created);
      renderForm({ preferredResourceId: RESOURCE_ID, durationMinutes: 60 });
      await screen.findByTestId('alert-resource');
      await fillRange();

      await userEvent.click(screen.getByTestId('alert-submit'));

      await waitFor(() =>
        expect(createAvailabilityAlert).toHaveBeenCalledWith({
          serviceId: SERVICE_ID,
          preferredResourceId: RESOURCE_ID,
          durationMinutes: 60,
          criteriaType: 'ONE_TIME_RANGE',
          acceptableStartAt: '2026-10-20T09:00:00-03:00',
          acceptableEndAt: '2026-10-27T18:00:00-03:00',
        }),
      );
      expect(await screen.findByRole('heading', { name: 'Aviso criado' })).toBeInTheDocument();
      expect(screen.getByTestId('availability-alert-back-to-site')).toHaveAttribute(
        'href',
        '/acme',
      );
    });

    it('never sends a participant count or a timezone', async () => {
      vi.mocked(createAvailabilityAlert).mockResolvedValue(created);
      renderForm();
      await fillRange();

      await userEvent.click(screen.getByTestId('alert-submit'));

      await waitFor(() => expect(createAvailabilityAlert).toHaveBeenCalled());
      const body = vi.mocked(createAvailabilityAlert).mock.calls[0][0];
      expect(body).not.toHaveProperty('participantCount');
      expect(body).not.toHaveProperty('timezone');
    });

    it('sends a weekly preference with the chosen weekdays in calendar order', async () => {
      vi.mocked(createAvailabilityAlert).mockResolvedValue({
        ...created,
        criteriaType: 'WEEKLY_PREFERENCE',
        acceptableStartAt: null,
        acceptableEndAt: null,
        weekdays: ['tuesday', 'thursday'],
        localStartTime: '09:00',
        localEndTime: '12:00',
      });
      renderForm();
      await userEvent.click(screen.getByTestId('criteria-weekly'));
      await userEvent.click(weekday('thursday'));
      await userEvent.click(weekday('tuesday'));

      await userEvent.click(screen.getByTestId('alert-submit'));

      await waitFor(() =>
        expect(createAvailabilityAlert).toHaveBeenCalledWith({
          serviceId: SERVICE_ID,
          criteriaType: 'WEEKLY_PREFERENCE',
          weekdays: ['tuesday', 'thursday'],
          localStartTime: '09:00',
          localEndTime: '12:00',
        }),
      );
      expect(await screen.findByText('Ter, Qui, 09:00 – 12:00')).toBeInTheDocument();
    });

    it('lets the customer toggle a weekday off again', async () => {
      renderForm();
      await userEvent.click(screen.getByTestId('criteria-weekly'));
      const monday = weekday('monday');

      await userEvent.click(monday);
      expect(monday).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(monday);
      expect(monday).toHaveAttribute('aria-pressed', 'false');
    });

    it('sends an expiry only when a non-default one is picked', async () => {
      vi.mocked(createAvailabilityAlert).mockResolvedValue(created);
      renderForm();
      await fillRange();
      await userEvent.click(screen.getByTestId('alert-expiry'));
      await userEvent.click(screen.getByRole('option', { name: '90 dias' }));

      await userEvent.click(screen.getByTestId('alert-submit'));

      await waitFor(() => expect(createAvailabilityAlert).toHaveBeenCalled());
      expect(vi.mocked(createAvailabilityAlert).mock.calls[0][0].expiresAt).toEqual(
        expect.any(String),
      );
    });

    it('disables the form and shows the progress label while saving', async () => {
      vi.mocked(createAvailabilityAlert).mockReturnValue(new Promise(() => undefined));
      renderForm();
      await fillRange();

      await userEvent.click(screen.getByTestId('alert-submit'));

      expect(await screen.findByRole('button', { name: 'Criando aviso…' })).toBeDisabled();
      expect(byRow('alert-date', 'rangeFrom')).toBeDisabled();
    });
  });

  describe('server answers', () => {
    async function submitWith(error: unknown) {
      vi.mocked(createAvailabilityAlert).mockRejectedValue(error);
      renderForm();
      await fillRange();
      await userEvent.click(screen.getByTestId('alert-submit'));
    }

    it('shows the cap-reached view on 409 BOOKING_ALERT_CAP_REACHED and can return to the form', async () => {
      await submitWith(new ApiError(409, 'cap', { code: 'BOOKING_ALERT_CAP_REACHED' }));

      expect(await screen.findByTestId('availability-alert-cap-reached')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      expect(screen.getByTestId('availability-alert-form')).toBeInTheDocument();
    });

    it('shows the not-eligible view on 422 BOOKING_ALERT_INELIGIBLE_SERVICE', async () => {
      await submitWith(new ApiError(422, 'no', { code: 'BOOKING_ALERT_INELIGIBLE_SERVICE' }));

      expect(await screen.findByTestId('availability-alert-ineligible')).toBeInTheDocument();
    });

    it('shows the translated message of any other problem code and keeps the form', async () => {
      await submitWith(new ApiError(422, 'bad', { code: 'BOOKING_ALERT_CRITERIA_INVALID' }));

      const alert = await screen.findByTestId('alert-submit-error');
      expect(alert).toBeInTheDocument();
      expect(screen.getByTestId('availability-alert-form')).toBeInTheDocument();
    });

    it('shows the generic failure when there is no problem code (network)', async () => {
      await submitWith(new Error('Network Error'));

      expect(await screen.findByText('Não foi possível criar o aviso.')).toBeInTheDocument();
      expect(
        screen.getByText('Verifique sua conexão e tente de novo. Nada foi salvo.'),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('the idle range form has no violations', async () => {
      const { container } = renderForm();

      expect(await axe(container)).toHaveNoViolations();
    });

    it('the weekly form has no violations', async () => {
      const { container } = renderForm();
      await userEvent.click(screen.getByTestId('criteria-weekly'));

      expect(await axe(container)).toHaveNoViolations();
    });

    it('the form showing validation errors has no violations', async () => {
      const { container } = renderForm();
      await userEvent.click(screen.getByTestId('alert-submit'));
      await screen.findByText('Informe o início do período.');

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  it('renders in English', () => {
    renderForm({}, 'en');

    expect(
      screen.getByRole('heading', { name: 'Notify me when a spot opens' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('alert-submit')).toHaveTextContent('Create alert');
  });
});
