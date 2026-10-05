// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  BufferTimelineEvent,
  TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import { axe } from '@/axe-helper';
import { renderWithIntl } from '@/test-utils';
import { ScheduleBufferBlock } from './ScheduleBufferBlock';

const TIMELINE: TimelineDayData = {
  selectedOpening: null,
  selectedDayHours: { open: '09:00', close: '12:00' },
  selectedDayClosed: false,
  timelineStartMinutes: 540,
  timelineEndMinutes: 720,
  slotCount: 6,
  slotHeight: 48,
  events: [],
  isOverriddenByOpening: false,
};

function makeEvent(overrides: Partial<BufferTimelineEvent> = {}): BufferTimelineEvent {
  return {
    kind: 'buffer',
    id: 'buffer-booking-1',
    startMinutes: 570,
    endMinutes: 600,
    title: 'Walace',
    subtitle: '',
    resourceName: 'Walace',
    releasesAtLocalTime: '10:00',
    gap: null,
    serviceName: 'Polimento',
    laneIndex: 0,
    laneCount: 1,
    ...overrides,
  };
}

function renderBlock(event: BufferTimelineEvent, locale = 'pt-BR') {
  return renderWithIntl(
    <ScheduleBufferBlock
      event={event}
      compact={false}
      timeline={TIMELINE}
      slotGranularityMinutes={30}
    />,
    { locale },
  );
}

describe('ScheduleBufferBlock', () => {
  it('names the held resource and the service buffer, with the full-sentence tooltip', () => {
    renderBlock(
      makeEvent({ gap: { source: 'SERVICE_BUFFER', minutes: 60, serviceName: 'Polimento' } }),
    );

    expect(screen.getByText('Walace · até 10:00')).toBeInTheDocument();
    expect(screen.getByText('Buffer do serviço Polimento · 60 min')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveAttribute(
      'title',
      'Buffer do serviço Polimento (60 min): Walace fica bloqueado(a) até 10:00. O mesmo buffer vale para todos os recursos deste agendamento.',
    );
  });

  it('names a resource turnover as the origin', () => {
    renderBlock(
      makeEvent({ gap: { source: 'RESOURCE_TURNOVER', minutes: 30, serviceName: null } }),
    );

    expect(screen.getByText('Virada do recurso · 30 min')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveAttribute(
      'title',
      'Virada do recurso Walace (30 min): só Walace fica bloqueado(a) até 10:00.',
    );
  });

  it('says the origin was not recorded for a legacy row, instead of guessing one', () => {
    renderBlock(makeEvent({ gap: null }));

    expect(screen.getByText('Origem não registrada')).toBeInTheDocument();
    expect(screen.getByText('Walace · até 10:00')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveAttribute(
      'title',
      'Walace fica bloqueado(a) até 10:00. A origem deste bloqueio não foi registrada.',
    );
  });

  it('is not focusable or clickable', () => {
    renderBlock(makeEvent());

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders every label in English too', () => {
    renderBlock(
      makeEvent({ gap: { source: 'SERVICE_BUFFER', minutes: 60, serviceName: 'Polimento' } }),
      'en',
    );

    expect(screen.getByText('Walace · until 10:00')).toBeInTheDocument();
    expect(screen.getByText('Service buffer Polimento · 60 min')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveAttribute(
      'title',
      'Service buffer Polimento (60 min): Walace is held until 10:00. The same buffer applies to every resource of this booking.',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = renderBlock(
      makeEvent({ gap: { source: 'RESOURCE_TURNOVER', minutes: 30, serviceName: null } }),
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
