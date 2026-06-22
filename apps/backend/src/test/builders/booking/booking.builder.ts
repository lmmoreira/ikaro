import {
  Booking,
  BookingProps,
  BookingStatus,
  BookingType,
} from '../../../contexts/booking/domain/booking.aggregate';
import { BookingLine } from '../../../contexts/booking/domain/booking-line.entity';
import { Address } from '../../../shared/value-objects/address';
import { Email } from '../../../shared/value-objects/email.vo';
import { Money } from '../../../shared/value-objects/money';
import { PhoneNumber } from '../../../shared/value-objects/phone-number.vo';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingLineBuilder } from './booking-line.builder';

export class BookingBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private status = BookingStatus.PENDING;
  private type: BookingType = 'GUEST';
  private customerId: string | null = null;
  private contactEmail = Email.create('guest@example.com');
  private contactName = 'João Silva';
  private contactPhone = PhoneNumber.create('+5531999999999');
  private contactAddress: Address | null = null;
  private pickupAddress: Address | null = null;
  private scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  private lines: BookingLine[] = [new BookingLineBuilder().build()];
  private totalDurationMins = 30;
  private totalPrice = Money.from(100, 'BRL');
  private totalActualPrice: Money | null = null;
  private beforeServicePhotoUrls: string[] = [];
  private afterServicePhotoUrls: string[] = [];
  private adminNotes: string | null = null;
  private readonly infoRequestMessage: string | null = null;
  private readonly infoRequestedAt: Date | null = null;
  private readonly infoRequestedBy: string | null = null;
  private readonly infoResponseMessage: string | null = null;
  private readonly infoSubmittedAt: Date | null = null;
  private approvedAt: Date | null = null;
  private approvedBy: string | null = null;
  private readonly completedAt: Date | null = null;
  private readonly completedBy: string | null = null;
  private readonly cancelledAt: Date | null = null;
  private readonly cancelledBy: string | null = null;
  private readonly cancellationReason: string | null = null;
  private readonly rejectedAt: Date | null = null;
  private readonly rejectedBy: string | null = null;
  private rejectionReason: string | null = null;
  private readonly createdAt = new Date();
  private linesModified = true;

  withId(id: string): this {
    this.id = id;
    return this;
  }
  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }
  withStatus(status: BookingStatus): this {
    this.status = status;
    return this;
  }
  withType(type: BookingType): this {
    this.type = type;
    return this;
  }
  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }
  withContactEmail(email: string): this {
    this.contactEmail = Email.create(email);
    return this;
  }
  withContactName(name: string): this {
    this.contactName = name;
    return this;
  }
  withContactPhone(phone: string): this {
    this.contactPhone = PhoneNumber.create(phone);
    return this;
  }
  withContactAddress(address: Address | null): this {
    this.contactAddress = address;
    return this;
  }
  withPickupAddress(address: Address | null): this {
    this.pickupAddress = address;
    return this;
  }
  withScheduledAt(scheduledAt: Date): this {
    this.scheduledAt = scheduledAt;
    return this;
  }
  withLines(lines: BookingLine[]): this {
    this.lines = lines;
    return this;
  }
  withTotalDurationMins(mins: number): this {
    this.totalDurationMins = mins;
    return this;
  }
  withTotalPrice(price: Money): this {
    this.totalPrice = price;
    return this;
  }
  withTotalActualPrice(price: Money | null): this {
    this.totalActualPrice = price;
    return this;
  }
  withApprovedAt(at: Date | null): this {
    this.approvedAt = at;
    return this;
  }
  withApprovedBy(by: string | null): this {
    this.approvedBy = by;
    return this;
  }
  withAdminNotes(notes: string | null): this {
    this.adminNotes = notes;
    return this;
  }
  withRejectionReason(reason: string | null): this {
    this.rejectionReason = reason;
    return this;
  }
  withBeforeServicePhotoUrls(urls: string[]): this {
    this.beforeServicePhotoUrls = urls;
    return this;
  }
  withAfterServicePhotoUrls(urls: string[]): this {
    this.afterServicePhotoUrls = urls;
    return this;
  }

  withLinesModified(value: boolean): this {
    this.linesModified = value;
    return this;
  }

  build(): Booking {
    const props: BookingProps = {
      id: this.id,
      tenantId: this.tenantId,
      status: this.status,
      type: this.type,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      contactPhone: this.contactPhone,
      contactAddress: this.contactAddress,
      pickupAddress: this.pickupAddress,
      scheduledAt: this.scheduledAt,
      totalDurationMins: this.totalDurationMins,
      totalPrice: this.totalPrice,
      totalActualPrice: this.totalActualPrice,
      lines: this.lines,
      beforeServicePhotoUrls: this.beforeServicePhotoUrls,
      afterServicePhotoUrls: this.afterServicePhotoUrls,
      adminNotes: this.adminNotes,
      infoRequestMessage: this.infoRequestMessage,
      infoRequestedAt: this.infoRequestedAt,
      infoRequestedBy: this.infoRequestedBy,
      infoResponseMessage: this.infoResponseMessage,
      infoSubmittedAt: this.infoSubmittedAt,
      approvedAt: this.approvedAt,
      approvedBy: this.approvedBy,
      completedAt: this.completedAt,
      completedBy: this.completedBy,
      cancelledAt: this.cancelledAt,
      cancelledBy: this.cancelledBy,
      cancellationReason: this.cancellationReason,
      rejectedAt: this.rejectedAt,
      rejectedBy: this.rejectedBy,
      rejectionReason: this.rejectionReason,
      createdAt: this.createdAt,
    };
    return Booking.reconstitute(props, this.linesModified);
  }
}
