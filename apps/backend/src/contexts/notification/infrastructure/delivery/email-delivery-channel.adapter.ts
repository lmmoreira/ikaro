import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryChannelType,
  IDeliveryChannel,
} from '../../application/ports/delivery-channel.port';
import { EMAIL_SENDER, IEmailSender } from '../../application/ports/email-sender.port';
import { OutboundMessage } from '../../application/ports/notification-dispatcher.port';
import {
  INotificationTenantPort,
  NOTIFICATION_TENANT_PORT,
} from '../../application/ports/notification-tenant.port';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

@Injectable()
export class EmailDeliveryChannelAdapter implements IDeliveryChannel {
  readonly channelType: DeliveryChannelType = 'EMAIL';

  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: IEmailSender,
    @Inject(NOTIFICATION_TENANT_PORT) private readonly tenantPort: INotificationTenantPort,
    private readonly config: ConfigService,
  ) {}

  async send(message: OutboundMessage): Promise<void> {
    const html = this.render(message);
    const tenantInfo = await this.tenantPort.getTenantInfo(message.tenantId);
    const from =
      tenantInfo?.fromEmail ?? this.config.get<string>('EMAIL_FROM', 'noreply@beloauto.com.br');

    await this.emailSender.send({
      to: message.to,
      from,
      subject: message.subject,
      html,
    });
  }

  private render(message: OutboundMessage): string {
    switch (message.templateKey) {
      case NotificationTemplateKey.STAFF_INVITATION: {
        const { tenantName, activationLink, staffName } = message.data as {
          tenantName: string;
          activationLink: string;
          staffName: string;
        };
        return `
        <p>Olá, ${staffName}!</p>
        <p>Você foi convidado para integrar a equipe de <strong>${tenantName}</strong> na plataforma BeloAuto.</p>
        <p><a href="${activationLink}">Clique aqui para aceitar o convite e acessar sua conta.</a></p>
        <p>Se você não esperava este convite, por favor ignore este e-mail.</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_REQUESTED_ADMIN: {
        const { guestName, scheduledAt, serviceNames, totalPrice, pickupAddress } =
          message.data as {
            guestName: string;
            scheduledAt: string;
            serviceNames: string;
            totalPrice: string;
            pickupAddress: { street: string; number: string; city: string; state: string } | null;
          };
        const pickupLine = pickupAddress
          ? `<p><strong>Endereço de coleta:</strong> ${pickupAddress.street}, ${pickupAddress.number} — ${pickupAddress.city}/${pickupAddress.state}</p>`
          : '';
        return `
        <p>Nova solicitação de agendamento recebida.</p>
        <p><strong>Cliente:</strong> ${guestName}</p>
        <p><strong>Data/Hora:</strong> ${scheduledAt}</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <p><strong>Total:</strong> ${totalPrice}</p>
        ${pickupLine}
      `;
      }
      case NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER: {
        const { guestName, scheduledAt, serviceNames, totalPrice, tenantName } = message.data as {
          guestName: string;
          scheduledAt: string;
          serviceNames: string;
          totalPrice: string;
          tenantName: string;
        };
        return `
        <p>Olá, ${guestName}!</p>
        <p>Recebemos sua solicitação de agendamento em <strong>${tenantName}</strong>.</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <p><strong>Data/Hora:</strong> ${scheduledAt}</p>
        <p><strong>Total:</strong> ${totalPrice}</p>
        <p>Entraremos em contato para confirmar seu agendamento.</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER: {
        const { guestName, localDate, localTime, serviceNames, lineItems, totalPrice } =
          message.data as {
            guestName: string;
            localDate: string;
            localTime: string;
            serviceNames: string;
            lineItems: string[];
            totalPrice: string;
          };
        const linesList = lineItems.map((l) => `<li>${l}</li>`).join('');
        return `
        <p>Olá, ${guestName}!</p>
        <p>Seu agendamento foi confirmado.</p>
        <p><strong>Data:</strong> ${localDate}</p>
        <p><strong>Horário:</strong> ${localTime}</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <ul>${linesList}</ul>
        <p><strong>Total:</strong> ${totalPrice}</p>
        <p>Aguardamos sua visita!</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER: {
        const { guestName, reason } = message.data as {
          guestName: string;
          reason: string;
        };
        return `
        <p>Olá, ${guestName}!</p>
        <p>Infelizmente não foi possível confirmar seu agendamento.</p>
        <p><strong>Motivo:</strong> ${reason}</p>
        <p>Se desejar, realize um novo agendamento em nosso site.</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER: {
        const { guestName, informationNeeded, respondLink } = message.data as {
          guestName: string;
          informationNeeded: string;
          respondLink: string;
        };
        return `
        <p>Olá, ${guestName}!</p>
        <p>Nossa equipe precisa de mais informações antes de confirmar seu agendamento.</p>
        <p><strong>Informações necessárias:</strong> ${informationNeeded}</p>
        <p><a href="${respondLink}">Clique aqui para responder</a></p>
      `;
      }
      case NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN: {
        const { submittedByEmail, customerResponse, bookingLink } = message.data as {
          submittedByEmail: string;
          customerResponse: string;
          bookingLink: string;
        };
        return `
        <p>O cliente <strong>${submittedByEmail}</strong> respondeu à solicitação de informações.</p>
        <p><strong>Resposta:</strong> ${customerResponse}</p>
        <p><a href="${bookingLink}">Ver agendamento no dashboard</a></p>
      `;
      }
      case NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER: {
        const { guestName, localDate, localTime, serviceNames, totalPrice } = message.data as {
          guestName: string;
          localDate: string;
          localTime: string;
          serviceNames: string;
          totalPrice: string;
        };
        return `
        <p>Olá, ${guestName}!</p>
        <p>Seu agendamento foi cancelado.</p>
        <p><strong>Data:</strong> ${localDate}</p>
        <p><strong>Horário:</strong> ${localTime}</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <p><strong>Total:</strong> ${totalPrice}</p>
        <p>Se desejar, realize um novo agendamento em nosso site.</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_CANCELLED_ADMIN: {
        const {
          guestName,
          localDate,
          localTime,
          serviceNames,
          totalPrice,
          cancelledBy,
          isBusiness,
          reason,
        } = message.data as {
          guestName: string;
          localDate: string;
          localTime: string;
          serviceNames: string;
          totalPrice: string;
          cancelledBy: string;
          isBusiness: boolean;
          reason: string | null;
        };
        const cancelledByLine = isBusiness
          ? `<p>O agendamento foi <strong>cancelado pela equipe</strong>.</p>`
          : `<p>O agendamento foi cancelado pelo cliente (<strong>${cancelledBy}</strong>).</p>`;
        const reasonLine = reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : '';
        return `
        <p>Agendamento cancelado.</p>
        <p><strong>Cliente:</strong> ${guestName}</p>
        <p><strong>Data:</strong> ${localDate}</p>
        <p><strong>Horário:</strong> ${localTime}</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <p><strong>Total:</strong> ${totalPrice}</p>
        ${cancelledByLine}
        ${reasonLine}
      `;
      }
      case NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER: {
        const {
          guestName,
          previousLocalDate,
          previousLocalTime,
          newLocalDate,
          newLocalTime,
          serviceNames,
          totalPrice,
        } = message.data as {
          guestName: string;
          previousLocalDate: string;
          previousLocalTime: string;
          newLocalDate: string;
          newLocalTime: string;
          serviceNames: string;
          totalPrice: string;
        };
        return `
        <p>Olá, ${guestName}!</p>
        <p>Seu agendamento foi reagendado.</p>
        <p><strong>Data anterior:</strong> ${previousLocalDate} às ${previousLocalTime}</p>
        <p><strong>Nova data:</strong> ${newLocalDate} às ${newLocalTime}</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <p><strong>Total:</strong> ${totalPrice}</p>
        <p>Aguardamos sua visita!</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN: {
        const {
          guestName,
          previousLocalDate,
          previousLocalTime,
          newLocalDate,
          newLocalTime,
          serviceNames,
          totalPrice,
        } = message.data as {
          guestName: string;
          previousLocalDate: string;
          previousLocalTime: string;
          newLocalDate: string;
          newLocalTime: string;
          serviceNames: string;
          totalPrice: string;
        };
        return `
        <p>Agendamento reagendado.</p>
        <p><strong>Cliente:</strong> ${guestName}</p>
        <p><strong>Data anterior:</strong> ${previousLocalDate} às ${previousLocalTime}</p>
        <p><strong>Nova data:</strong> ${newLocalDate} às ${newLocalTime}</p>
        <p><strong>Serviços:</strong> ${serviceNames}</p>
        <p><strong>Total:</strong> ${totalPrice}</p>
      `;
      }
      case NotificationTemplateKey.SERVICE_POINTS_EARNED: {
        const { customerName, totalPointsEarned, currentBalance } = message.data as {
          customerName: string;
          totalPointsEarned: number;
          currentBalance: number;
        };
        return `
        <p>Olá, ${customerName}!</p>
        <p>Sua lavagem foi concluída e você ganhou <strong>${totalPointsEarned} pontos</strong> de fidelidade.</p>
        <p>Seu saldo atual é de <strong>${currentBalance} pontos</strong>.</p>
        <p>Use seus pontos no próximo agendamento!</p>
      `;
      }
      case NotificationTemplateKey.POINTS_EXPIRING_SOON: {
        const { customerName, pointsExpiringSoon, earliestExpiresAt } = message.data as {
          customerName: string;
          pointsExpiringSoon: number;
          earliestExpiresAt: string;
        };
        return `
        <p>Olá, ${customerName}!</p>
        <p>Você tem <strong>${pointsExpiringSoon} pontos</strong> prestes a expirar em ${earliestExpiresAt}.</p>
        <p>Realize um agendamento para utilizar seus pontos antes que expirem.</p>
      `;
      }
      case NotificationTemplateKey.BOOKING_REMINDER_DUE:
      case NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY:
      case NotificationTemplateKey.ADMIN_DAILY_SCHEDULE_REMINDER:
      default:
        return `<p>${message.subject}</p>`;
    }
  }
}
