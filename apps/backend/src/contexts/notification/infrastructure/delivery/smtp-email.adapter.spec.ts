import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SmtpEmailAdapter } from './smtp-email.adapter';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

jest.mock('nodemailer');

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: mockSendMail });

const configService = {
  get: jest.fn().mockReturnValue(undefined),
} as unknown as ConfigService;

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('SmtpEmailAdapter', () => {
  let adapter: SmtpEmailAdapter;

  beforeEach(() => {
    mockSendMail.mockClear();
    adapter = new SmtpEmailAdapter(configService);
  });

  it('has channelType EMAIL', () => {
    expect(adapter.channelType).toBe('EMAIL');
  });

  describe('staff-invitation template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'maria@lavacar.com.br',
      subject: 'Você foi convidado para a equipe Lava Car',
      templateKey: NotificationTemplateKey.STAFF_INVITATION,
      data: {
        staffName: 'Maria',
        tenantName: 'Lava Car',
        activationLink: 'http://localhost:3000/lavacar/auth/staff',
      },
    };

    it('sends email to correct recipient with correct subject', async () => {
      await adapter.send(message);

      const call = mockSendMail.mock.calls[0][0] as { to: string; subject: string };
      expect(call.to).toBe('maria@lavacar.com.br');
      expect(call.subject).toBe('Você foi convidado para a equipe Lava Car');
    });

    it('renders tenant name, staff name, and activation link', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Lava Car');
      expect(html).toContain('Maria');
      expect(html).toContain('http://localhost:3000/lavacar/auth/staff');
    });
  });

  describe('booking-requested-admin template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'admin@lavacar.com.br',
      subject: 'Nova solicitação de agendamento — Lavagem Completa',
      templateKey: NotificationTemplateKey.BOOKING_REQUESTED_ADMIN,
      data: {
        guestName: 'João Silva',
        scheduledAt: '2026-06-15T13:00:00.000Z',
        serviceNames: 'Lavagem Completa',
        totalPrice: 'R$ 100,00',
        pickupAddress: null,
      },
    };

    it('renders guest name, scheduled time, service and total', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('2026-06-15T13:00:00.000Z');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('R$ 100,00');
    });

    it('omits pickup section when pickupAddress is null', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).not.toContain('coleta');
    });

    it('renders pickup address when provided', async () => {
      const withPickup: OutboundMessage = {
        ...message,
        data: {
          ...message.data,
          pickupAddress: {
            street: 'Rua das Flores',
            number: '10',
            city: 'Belo Horizonte',
            state: 'MG',
          },
        },
      };
      await adapter.send(withPickup);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Rua das Flores');
      expect(html).toContain('Belo Horizonte');
    });
  });

  describe('booking-requested-customer template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Seu agendamento foi recebido',
      templateKey: NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER,
      data: {
        guestName: 'João Silva',
        scheduledAt: '2026-06-15T13:00:00.000Z',
        serviceNames: 'Lavagem Completa',
        totalPrice: 'R$ 100,00',
        tenantName: 'Lava Car',
      },
    };

    it('renders guest name, tenant name, service, date and total', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('Lava Car');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('2026-06-15T13:00:00.000Z');
      expect(html).toContain('R$ 100,00');
    });
  });

  describe('booking-approved-customer template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Seu agendamento foi confirmado! ✓',
      templateKey: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      data: {
        guestName: 'João Silva',
        localDate: '15/06/2026',
        localTime: '10:00',
        serviceNames: 'Lavagem Completa',
        lineItems: ['Lavagem Completa: R$ 100,00'],
        totalPrice: 'R$ 100,00',
      },
    };

    it('renders guest name, local date, local time, service and total', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('15/06/2026');
      expect(html).toContain('10:00');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('R$ 100,00');
    });

    it('renders each line item', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('<li>Lavagem Completa: R$ 100,00</li>');
    });
  });

  describe('booking-rejected-customer template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Sobre seu pedido de agendamento',
      templateKey: NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER,
      data: {
        guestName: 'João Silva',
        reason: 'Horário indisponível para os serviços selecionados',
      },
    };

    it('renders guest name and rejection reason', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('Horário indisponível para os serviços selecionados');
    });
  });

  describe('booking-info-requested-customer template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Precisamos de mais informações sobre seu agendamento',
      templateKey: NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER,
      data: {
        guestName: 'João Silva',
        informationNeeded: 'Por favor envie fotos do veículo',
        respondLink: 'http://localhost:3000/bookings/abc/responder?token=xyz',
      },
    };

    it('renders guest name, information needed and respond link', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('Por favor envie fotos do veículo');
      expect(html).toContain('http://localhost:3000/bookings/abc/responder?token=xyz');
    });
  });

  describe('booking-info-submitted-admin template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'admin@lavacar.com.br',
      subject: 'Cliente respondeu à solicitação de informações',
      templateKey: NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN,
      data: {
        submittedByEmail: 'joao@example.com',
        customerResponse: 'Aqui estão as fotos do veículo',
        bookingLink: 'http://localhost:3000/dashboard/bookings/abc',
      },
    };

    it('renders submitter email, customer response and booking link', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('joao@example.com');
      expect(html).toContain('Aqui estão as fotos do veículo');
      expect(html).toContain('http://localhost:3000/dashboard/bookings/abc');
    });
  });

  describe('booking-cancelled-customer template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Seu agendamento foi cancelado',
      templateKey: NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER,
      data: {
        guestName: 'João Silva',
        localDate: '01/07/2026',
        localTime: '10:00',
        serviceNames: 'Lavagem Completa',
        totalPrice: 'R$ 150,00',
      },
    };

    it('renders guest name, date, time, service and total', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('01/07/2026');
      expect(html).toContain('10:00');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('R$ 150,00');
    });
  });

  describe('booking-cancelled-admin template', () => {
    const baseMessage: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'admin@lavacar.com.br',
      subject: 'Agendamento cancelado',
      templateKey: NotificationTemplateKey.BOOKING_CANCELLED_ADMIN,
      data: {
        guestName: 'João Silva',
        localDate: '01/07/2026',
        localTime: '10:00',
        serviceNames: 'Lavagem Completa',
        totalPrice: 'R$ 150,00',
        cancelledBy: 'João Silva',
        isBusiness: false,
        reason: null,
      },
    };

    it('renders guest name, date, time, service, total and canceller when isBusiness=false', async () => {
      await adapter.send(baseMessage);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('01/07/2026');
      expect(html).toContain('10:00');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('R$ 150,00');
      expect(html).toContain('João Silva');
    });

    it('renders business-cancelled line when isBusiness=true', async () => {
      const message: OutboundMessage = {
        ...baseMessage,
        data: { ...baseMessage.data, isBusiness: true },
      };
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('cancelado pela equipe');
    });

    it('renders reason when provided', async () => {
      const message: OutboundMessage = {
        ...baseMessage,
        data: { ...baseMessage.data, reason: 'Indisponibilidade' },
      };
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Indisponibilidade');
    });

    it('omits reason line when reason is null', async () => {
      await adapter.send(baseMessage);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).not.toContain('Motivo');
    });
  });

  describe('booking-rescheduled-customer template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Seu agendamento foi reagendado',
      templateKey: NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER,
      data: {
        guestName: 'João Silva',
        previousLocalDate: '01/07/2026',
        previousLocalTime: '10:00',
        newLocalDate: '07/07/2026',
        newLocalTime: '11:00',
        serviceNames: 'Lavagem Completa',
        totalPrice: 'R$ 150,00',
      },
    };

    it('renders guest name, previous and new date/time, service and total', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('01/07/2026');
      expect(html).toContain('10:00');
      expect(html).toContain('07/07/2026');
      expect(html).toContain('11:00');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('R$ 150,00');
    });
  });

  describe('booking-rescheduled-admin template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'admin@lavacar.com.br',
      subject: 'Agendamento reagendado',
      templateKey: NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN,
      data: {
        guestName: 'João Silva',
        previousLocalDate: '01/07/2026',
        previousLocalTime: '10:00',
        newLocalDate: '07/07/2026',
        newLocalTime: '11:00',
        serviceNames: 'Lavagem Completa',
        totalPrice: 'R$ 150,00',
      },
    };

    it('renders guest name, previous and new date/time, service and total', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('01/07/2026');
      expect(html).toContain('10:00');
      expect(html).toContain('07/07/2026');
      expect(html).toContain('11:00');
      expect(html).toContain('Lavagem Completa');
      expect(html).toContain('R$ 150,00');
    });
  });

  describe('service-points-earned template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Você ganhou 50 pontos',
      templateKey: NotificationTemplateKey.SERVICE_POINTS_EARNED,
      data: {
        customerName: 'João Silva',
        totalPointsEarned: 50,
        currentBalance: 150,
      },
    };

    it('renders customer name, points earned and current balance', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('50');
      expect(html).toContain('150');
    });
  });

  describe('points-expiring-soon template', () => {
    const message: OutboundMessage = {
      tenantId: TENANT_ID,
      to: 'joao@example.com',
      subject: 'Seus pontos estão prestes a expirar',
      templateKey: NotificationTemplateKey.POINTS_EXPIRING_SOON,
      data: {
        customerName: 'João Silva',
        pointsExpiringSoon: 30,
        earliestExpiresAt: '30/06/2026',
      },
    };

    it('renders customer name, expiring points and expiry date', async () => {
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('João Silva');
      expect(html).toContain('30');
      expect(html).toContain('30/06/2026');
    });
  });

  describe('booking-reminder-due template', () => {
    it('falls back to subject-only paragraph', async () => {
      const message: OutboundMessage = {
        tenantId: TENANT_ID,
        to: 'joao@example.com',
        subject: 'Lembrete: seu agendamento é amanhã!',
        templateKey: NotificationTemplateKey.BOOKING_REMINDER_DUE,
        data: {},
      };
      await adapter.send(message);
      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Lembrete: seu agendamento é amanhã!');
    });
  });

  describe('booking-reminder-due-today template', () => {
    it('falls back to subject-only paragraph', async () => {
      const message: OutboundMessage = {
        tenantId: TENANT_ID,
        to: 'joao@example.com',
        subject: 'Lembrete: seu agendamento é hoje!',
        templateKey: NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY,
        data: {},
      };
      await adapter.send(message);
      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Lembrete: seu agendamento é hoje!');
    });
  });

  describe('admin-daily-schedule-reminder template', () => {
    it('falls back to subject-only paragraph', async () => {
      const message: OutboundMessage = {
        tenantId: TENANT_ID,
        to: 'admin@lavacar.com.br',
        subject: 'Agenda do dia',
        templateKey: NotificationTemplateKey.ADMIN_DAILY_SCHEDULE_REMINDER,
        data: {},
      };
      await adapter.send(message);
      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Agenda do dia');
    });
  });

  describe('unknown template key', () => {
    it('falls back to subject-only paragraph', async () => {
      const message: OutboundMessage = {
        tenantId: TENANT_ID,
        to: 'test@example.com',
        subject: 'Some notification',
        templateKey: 'unknown-template' as unknown as NotificationTemplateKey,
        data: {},
      };
      await adapter.send(message);

      const { html } = mockSendMail.mock.calls[0][0] as { html: string };
      expect(html).toContain('Some notification');
    });
  });
});
