import { Inject, Injectable } from '@nestjs/common';
import { utcDateToLocalHHMM } from '../../../../../shared/utils/calendar-date';
import { escapeHtml } from '../../../../../shared/utils/escape-html';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { SendAdminDailyScheduleReminderNotificationDto } from '../../dtos/send-admin-daily-schedule-reminder-notification.dto';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../ports/notification-dispatcher.port';
import {
  INotificationLogRepository,
  NOTIFICATION_LOG_REPOSITORY,
} from '../../ports/notification-log-repository.port';
import {
  INotificationProcessedEventRepository,
  NOTIFICATION_PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';
import {
  INotificationStaffPort,
  NOTIFICATION_STAFF_PORT,
} from '../../ports/notification-staff.port';
import {
  INotificationPlatformPort,
  NOTIFICATION_PLATFORM_PORT,
} from '../../ports/notification-platform.port';
import {
  INotificationTemplateRepository,
  NOTIFICATION_TEMPLATE_REPOSITORY,
} from '../../ports/notification-template-repository.port';
import { BaseNotificationUseCase } from '../base-notification.use-case';

const TRIGGER = NotificationTemplateKey.ADMIN_DAILY_SCHEDULE_REMINDER;

export interface SendAdminDailyScheduleReminderNotificationUseCaseResult {
  emailSent: boolean;
  recipientCount: number;
}

@Injectable()
export class SendAdminDailyScheduleReminderNotificationUseCase extends BaseNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_LOG_REPOSITORY) logRepo: INotificationLogRepository,
    @Inject(NOTIFICATION_PROCESSED_EVENT_REPOSITORY)
    processedEventRepo: INotificationProcessedEventRepository,
    @Inject(NOTIFICATION_DISPATCHER) dispatcher: INotificationDispatcher,
    @Inject(NOTIFICATION_STAFF_PORT) private readonly staffPort: INotificationStaffPort,
    @Inject(NOTIFICATION_PLATFORM_PORT) private readonly tenantPort: INotificationPlatformPort,
    @Inject(TRANSACTION_MANAGER) txManager: ITransactionManager,
    @Inject(NOTIFICATION_TEMPLATE_REPOSITORY)
    private readonly templateRepo: INotificationTemplateRepository,
  ) {
    super(logRepo, processedEventRepo, dispatcher, txManager);
  }

  async execute(
    dto: SendAdminDailyScheduleReminderNotificationDto,
  ): Promise<SendAdminDailyScheduleReminderNotificationUseCaseResult> {
    const templates = await this.templateRepo.findAllByTriggerEvent(dto.tenantId, TRIGGER);
    if (templates.length === 0) {
      this.logger.warn('No template found — skipping', {
        tenantId: dto.tenantId,
        triggerEvent: TRIGGER,
      });
      return { emailSent: false, recipientCount: 0 };
    }

    const managerEmails = await this.staffPort.getManagerEmails(dto.tenantId);
    if (managerEmails.length === 0) {
      return { emailSent: false, recipientCount: 0 };
    }

    const tenantInfo = await this.tenantPort.getTenantInfo(dto.tenantId);
    const timezone = tenantInfo?.timezone ?? 'UTC';
    const bookingsHtml = this.buildBookingsHtml(dto.bookingsToday, timezone);

    const emailSent = await this.dispatchTemplatesToMany(templates, dto, managerEmails, {
      localDate: dto.localDate,
      totalBookingsToday: String(dto.totalBookingsToday),
      bookingsHtml,
    });
    return { emailSent, recipientCount: emailSent ? managerEmails.length : 0 };
  }

  private buildBookingsHtml(
    bookingsToday: SendAdminDailyScheduleReminderNotificationDto['bookingsToday'],
    timezone: string,
  ): string {
    if (bookingsToday.length === 0) {
      return '<p>Nenhum agendamento para hoje</p>';
    }

    const rows = bookingsToday
      .map((b) => {
        const startDate = new Date(b.appointmentSlot.startTime);
        const endDate = new Date(b.appointmentSlot.endTime);
        const localTime = utcDateToLocalHHMM(startDate, timezone);
        const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
        const serviceNames = b.lines.map((l) => escapeHtml(l.serviceName)).join(', ');
        const phone = b.customerPhone ? escapeHtml(b.customerPhone) : '-';
        const notes = b.adminNotes ? escapeHtml(b.adminNotes) : '-';
        return `<tr><td>${localTime}</td><td>${escapeHtml(b.customerName)}</td><td>${phone}</td><td>${serviceNames}</td><td>${durationMin} min</td><td>${notes}</td></tr>`;
      })
      .join('');

    return `<table><thead><tr><th>Horário</th><th>Cliente</th><th>Telefone</th><th>Serviços</th><th>Duração</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}
