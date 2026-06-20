import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingEntity } from '../../../contexts/booking/infrastructure/entities/booking.entity';

export class BookingEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private status = 'PENDING';
  private type = 'GUEST';
  private customerId: string | null = null;
  private contactEmail = 'guest@example.com';
  private contactName = 'João Silva';
  private contactPhone = '+5531999999999';
  private contactAddress: Record<string, unknown> | null = null;
  private pickupAddress: Record<string, unknown> | null = null;
  private scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  private totalDurationMins = 30;
  private totalPriceAmount = '100.00';
  private readonly totalActualPriceAmount: string | null = null;
  private readonly beforeServicePhotoUrls: string[] = [];
  private readonly afterServicePhotoUrls: string[] = [];
  private readonly adminNotes: string | null = null;
  private readonly infoRequestMessage: string | null = null;
  private readonly infoRequestedAt: Date | null = null;
  private readonly infoRequestedBy: string | null = null;
  private readonly infoResponseMessage: string | null = null;
  private readonly infoSubmittedAt: Date | null = null;
  private readonly approvedAt: Date | null = null;
  private readonly approvedBy: string | null = null;
  private readonly completedAt: Date | null = null;
  private readonly completedBy: string | null = null;
  private readonly cancelledAt: Date | null = null;
  private readonly cancelledBy: string | null = null;
  private readonly cancellationReason: string | null = null;
  private readonly rejectedAt: Date | null = null;
  private readonly rejectedBy: string | null = null;
  private readonly rejectionReason: string | null = null;
  private readonly createdAt = new Date();
  private readonly updatedAt = new Date();
  private version = 1;

  withId(id: string): this {
    this.id = id;
    return this;
  }
  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }
  withStatus(status: string): this {
    this.status = status;
    return this;
  }
  withType(type: string): this {
    this.type = type;
    return this;
  }
  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }
  withContactEmail(email: string): this {
    this.contactEmail = email;
    return this;
  }
  withContactName(name: string): this {
    this.contactName = name;
    return this;
  }
  withContactPhone(phone: string): this {
    this.contactPhone = phone;
    return this;
  }
  withContactAddress(address: Record<string, unknown> | null): this {
    this.contactAddress = address;
    return this;
  }
  withPickupAddress(address: Record<string, unknown> | null): this {
    this.pickupAddress = address;
    return this;
  }
  withScheduledAt(date: Date): this {
    this.scheduledAt = date;
    return this;
  }
  withTotalDurationMins(mins: number): this {
    this.totalDurationMins = mins;
    return this;
  }
  withTotalPriceAmount(amount: string): this {
    this.totalPriceAmount = amount;
    return this;
  }

  withVersion(version: number): this {
    this.version = version;
    return this;
  }

  build(): BookingEntity {
    const entity = new BookingEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.status = this.status;
    entity.type = this.type;
    entity.customerId = this.customerId;
    entity.contactEmail = this.contactEmail;
    entity.contactName = this.contactName;
    entity.contactPhone = this.contactPhone;
    entity.contactAddress = this.contactAddress;
    entity.pickupAddress = this.pickupAddress;
    entity.scheduledAt = this.scheduledAt;
    entity.totalDurationMins = this.totalDurationMins;
    entity.totalPriceAmount = this.totalPriceAmount;
    entity.totalActualPriceAmount = this.totalActualPriceAmount;
    entity.beforeServicePhotoUrls = this.beforeServicePhotoUrls;
    entity.afterServicePhotoUrls = this.afterServicePhotoUrls;
    entity.adminNotes = this.adminNotes;
    entity.infoRequestMessage = this.infoRequestMessage;
    entity.infoRequestedAt = this.infoRequestedAt;
    entity.infoRequestedBy = this.infoRequestedBy;
    entity.infoResponseMessage = this.infoResponseMessage;
    entity.infoSubmittedAt = this.infoSubmittedAt;
    entity.approvedAt = this.approvedAt;
    entity.approvedBy = this.approvedBy;
    entity.completedAt = this.completedAt;
    entity.completedBy = this.completedBy;
    entity.cancelledAt = this.cancelledAt;
    entity.cancelledBy = this.cancelledBy;
    entity.cancellationReason = this.cancellationReason;
    entity.rejectedAt = this.rejectedAt;
    entity.rejectedBy = this.rejectedBy;
    entity.rejectionReason = this.rejectionReason;
    entity.createdAt = this.createdAt;
    entity.updatedAt = this.updatedAt;
    entity.version = this.version;
    return entity;
  }
}
