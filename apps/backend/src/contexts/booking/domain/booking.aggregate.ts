import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Address } from '../../../shared/value-objects/address';
import { Email } from '../../../shared/value-objects/email.vo';
import { Money } from '../../../shared/value-objects/money';
import { PhoneNumber } from '../../../shared/value-objects/phone-number.vo';
import { normalizeOptionalText, normalizeText } from '../../../shared/utils/text-normalization';
import { BookingLine, BookingLineInput } from './booking-line.entity';
import {
  BookingDiscountExceedsTotalError,
  BookingInfoMessageTooShortError,
  BookingLineRequiredError,
  BookingRejectionReasonTooShortError,
  InvalidBookingTransitionError,
  PickupAddressRequiredError,
} from './errors/booking-domain.error';
import { BookingApproved } from './events/booking-approved.event';
import { BookingCancelled } from './events/booking-cancelled.event';
import { BookingCompleted } from './events/booking-completed.event';
import { BookingInfoRequested } from './events/booking-info-requested.event';
import { BookingInfoSubmitted } from './events/booking-info-submitted.event';
import { BookingRequested } from './events/booking-requested.event';
import { BookingRescheduled } from './events/booking-rescheduled.event';
import { BookingRejected } from './events/booking-rejected.event';

export enum BookingStatus {
  PENDING = 'PENDING',
  INFO_REQUESTED = 'INFO_REQUESTED',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export type BookingType = 'GUEST' | 'CUSTOMER';

export interface BookingProps {
  id: string;
  tenantId: string;
  status: BookingStatus;
  type: BookingType;
  customerId: string | null;
  contactEmail: Email;
  contactName: string;
  contactPhone: PhoneNumber;
  contactAddress: Address | null;
  pickupAddress: Address | null;
  notes: string | null;
  scheduledAt: Date;
  totalDurationMins: number;
  totalPrice: Money;
  totalActualPrice: Money | null;
  discountPointsUsed: number | null;
  discountAmount: Money | null;
  lines: BookingLine[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoRequestedAt: Date | null;
  infoRequestedBy: string | null;
  infoResponseMessage: string | null;
  infoSubmittedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  version?: number;
}

export interface RequestBookingInput {
  /**
   * Pre-generated booking ID — pass this when the caller needs to know the ID before the
   * aggregate exists (e.g. to promote `tmp/`-staged photos to their permanent
   * `tenants/<id>/bookings/<bookingId>/...` path before construction; see
   * td/TD22-ORPHANED-UPLOAD-CLEANUP.md). Omit to keep the existing behavior of generating a
   * fresh `uuidv7()` inside the factory.
   */
  id?: string;
  tenantId: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: Date;
  lineInputs: BookingLineInput[];
  type: BookingType;
  correlationId: string;
  customerId?: string;
  contactAddress?: Address;
  pickupAddress?: Address;
  notes?: string;
  beforeServicePhotoUrls?: string[];
}

export class Booking extends AggregateRoot {
  private readonly props: BookingProps;
  private _linesModified = false;

  private constructor(props: BookingProps) {
    super();
    this.props = props;
  }

  get linesModified(): boolean {
    return this._linesModified;
  }

  get version(): number | undefined {
    return this.props.version;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get status(): BookingStatus {
    return this.props.status;
  }
  get type(): BookingType {
    return this.props.type;
  }
  get customerId(): string | null {
    return this.props.customerId;
  }
  get contactEmail(): Email {
    return this.props.contactEmail;
  }
  get contactName(): string {
    return this.props.contactName;
  }
  get contactPhone(): PhoneNumber {
    return this.props.contactPhone;
  }
  get contactAddress(): Address | null {
    return this.props.contactAddress;
  }
  get pickupAddress(): Address | null {
    return this.props.pickupAddress;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get scheduledAt(): Date {
    return this.props.scheduledAt;
  }
  get totalDurationMins(): number {
    return this.props.totalDurationMins;
  }
  get totalPrice(): Money {
    return this.props.totalPrice;
  }
  get totalActualPrice(): Money | null {
    return this.props.totalActualPrice;
  }
  get discountPointsUsed(): number | null {
    return this.props.discountPointsUsed;
  }
  get discountAmount(): Money | null {
    return this.props.discountAmount;
  }
  get lines(): BookingLine[] {
    return [...this.props.lines];
  }
  get beforeServicePhotoUrls(): string[] {
    return [...this.props.beforeServicePhotoUrls];
  }
  get afterServicePhotoUrls(): string[] {
    return [...this.props.afterServicePhotoUrls];
  }
  get adminNotes(): string | null {
    return this.props.adminNotes;
  }
  get infoRequestMessage(): string | null {
    return this.props.infoRequestMessage;
  }
  get infoRequestedAt(): Date | null {
    return this.props.infoRequestedAt;
  }
  get infoRequestedBy(): string | null {
    return this.props.infoRequestedBy;
  }
  get infoResponseMessage(): string | null {
    return this.props.infoResponseMessage;
  }
  get infoSubmittedAt(): Date | null {
    return this.props.infoSubmittedAt;
  }
  get approvedAt(): Date | null {
    return this.props.approvedAt;
  }
  get approvedBy(): string | null {
    return this.props.approvedBy;
  }
  get completedAt(): Date | null {
    return this.props.completedAt;
  }
  get completedBy(): string | null {
    return this.props.completedBy;
  }
  get cancelledAt(): Date | null {
    return this.props.cancelledAt;
  }
  get cancelledBy(): string | null {
    return this.props.cancelledBy;
  }
  get cancellationReason(): string | null {
    return this.props.cancellationReason;
  }
  get rejectedAt(): Date | null {
    return this.props.rejectedAt;
  }
  get rejectedBy(): string | null {
    return this.props.rejectedBy;
  }
  get rejectionReason(): string | null {
    return this.props.rejectionReason;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  static requestBooking(input: RequestBookingInput): Booking {
    const {
      id: suppliedId,
      tenantId,
      contactEmail,
      contactName,
      contactPhone,
      scheduledAt,
      lineInputs,
      type,
      correlationId,
      customerId,
      contactAddress,
      pickupAddress,
      notes,
      beforeServicePhotoUrls = [],
    } = input;

    if (!lineInputs.length) throw new BookingLineRequiredError();

    const requiresPickup = lineInputs.some((l) => l.requiresPickupAddressAtBooking);
    if (requiresPickup && !pickupAddress) throw new PickupAddressRequiredError();

    const id = suppliedId ?? uuidv7();
    const lines = lineInputs.map((input) => BookingLine.create(id, tenantId, input));
    const totalDurationMins = lines.reduce((sum, l) => sum + l.durationMinsAtBooking, 0);
    const totalPrice = lines.reduce(
      (sum, l) => sum.add(l.priceAtBooking),
      Money.zero(lines[0].priceAtBooking.currency),
    );

    const booking = new Booking({
      id,
      tenantId,
      status: BookingStatus.PENDING,
      type,
      customerId: customerId ?? null,
      contactEmail: Email.create(contactEmail),
      contactName: normalizeText(contactName),
      contactPhone: PhoneNumber.create(contactPhone),
      contactAddress: contactAddress ?? null,
      pickupAddress: pickupAddress ?? null,
      notes: normalizeOptionalText(notes),
      scheduledAt,
      totalDurationMins,
      totalPrice,
      totalActualPrice: null,
      discountPointsUsed: null,
      discountAmount: null,
      lines,
      beforeServicePhotoUrls: [...beforeServicePhotoUrls],
      afterServicePhotoUrls: [],
      adminNotes: null,
      infoRequestMessage: null,
      infoRequestedAt: null,
      infoRequestedBy: null,
      infoResponseMessage: null,
      infoSubmittedAt: null,
      approvedAt: null,
      approvedBy: null,
      completedAt: null,
      completedBy: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      createdAt: new Date(),
    });

    booking._linesModified = true;

    booking.addDomainEvent(
      new BookingRequested(tenantId, correlationId, {
        bookingId: id,
        type,
        customerId: customerId ?? null,
        contactEmail,
        contactName: normalizeText(contactName),
        contactPhone,
        contactAddress: Booking.toAddressPayload(contactAddress ?? null),
        scheduledAt: scheduledAt.toISOString(),
        totalDurationMins,
        totalPrice: { amount: totalPrice.amount.toFixed(2), currency: totalPrice.currency },
        requiresPickup,
        pickupAddress: Booking.toAddressPayload(pickupAddress ?? null),
        lines: lines.map((l) => ({
          lineId: l.lineId,
          serviceId: l.serviceId,
          serviceNameAtBooking: l.serviceNameAtBooking,
          priceAtBooking: {
            amount: l.priceAtBooking.amount.toFixed(2),
            currency: l.priceAtBooking.currency,
          },
          durationMinsAtBooking: l.durationMinsAtBooking,
          pointsValueAtBooking: l.pointsValueAtBooking,
          requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
        })),
        beforeServicePhotoUrls: [...beforeServicePhotoUrls],
      }),
    );

    return booking;
  }

  approve(staffId: string, correlationId: string, scheduledAt?: Date): void {
    if (
      this.props.status !== BookingStatus.PENDING &&
      this.props.status !== BookingStatus.INFO_REQUESTED
    ) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.APPROVED);
    }

    if (scheduledAt) {
      this.props.scheduledAt = scheduledAt;
    }

    this.props.status = BookingStatus.APPROVED;
    this.props.approvedAt = new Date();
    this.props.approvedBy = staffId;

    const endTime = new Date(
      this.props.scheduledAt.getTime() + this.props.totalDurationMins * 60_000,
    );

    this.addDomainEvent(
      new BookingApproved(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: this.props.customerId,
        contactEmail: this.props.contactEmail.address,
        contactName: this.props.contactName,
        approvedSlot: {
          startTime: this.props.scheduledAt.toISOString(),
          endTime: endTime.toISOString(),
        },
        totalPrice: this.totalPricePayload(),
        lineSummary: this.lineSummaryPayload(),
        approvedBy: staffId,
      }),
    );
  }

  reject(staffId: string, reason: string, correlationId: string): void {
    const normalizedReason = normalizeText(reason);
    if (normalizedReason.length < 10) {
      throw new BookingRejectionReasonTooShortError();
    }
    if (
      this.props.status !== BookingStatus.PENDING &&
      this.props.status !== BookingStatus.INFO_REQUESTED
    ) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.REJECTED);
    }

    this.props.status = BookingStatus.REJECTED;
    this.props.rejectedAt = new Date();
    this.props.rejectedBy = staffId;
    this.props.rejectionReason = normalizedReason;

    this.addDomainEvent(
      new BookingRejected(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: this.props.customerId,
        contactEmail: this.props.contactEmail.address,
        contactName: this.props.contactName,
        reason: normalizedReason,
        rejectedBy: staffId,
      }),
    );
  }

  requestMoreInfo(staffId: string, message: string, correlationId: string): void {
    const normalizedMessage = normalizeText(message);
    if (normalizedMessage.length < 20) {
      throw new BookingInfoMessageTooShortError();
    }
    if (this.props.status !== BookingStatus.PENDING) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.INFO_REQUESTED);
    }

    this.props.status = BookingStatus.INFO_REQUESTED;
    this.props.infoRequestMessage = normalizedMessage;
    this.props.infoRequestedAt = new Date();
    this.props.infoRequestedBy = staffId;

    this.addDomainEvent(
      new BookingInfoRequested(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: this.props.customerId,
        contactEmail: this.props.contactEmail.address,
        contactName: this.props.contactName,
        informationNeeded: normalizedMessage,
        requestedBy: staffId,
      }),
    );
  }

  submitInformation(
    submittedByEmail: string,
    infoPayload: Record<string, unknown>,
    correlationId: string,
    photoUrls: string[] = [],
    customerId?: string,
  ): void {
    if (this.props.status !== BookingStatus.INFO_REQUESTED) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.PENDING);
    }

    this.props.status = BookingStatus.PENDING;
    this.props.infoResponseMessage =
      typeof infoPayload['notes'] === 'string' ? infoPayload['notes'] : null;
    this.props.infoSubmittedAt = new Date();

    if (photoUrls.length) {
      this.props.beforeServicePhotoUrls.push(...photoUrls);
    }

    this.addDomainEvent(
      new BookingInfoSubmitted(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: customerId ?? null,
        submittedByEmail,
        infoPayload,
        photoUrls,
      }),
    );
  }

  complete(
    staffId: string,
    lineActualPrices: Map<string, Money>,
    afterPhotos: string[],
    correlationId: string,
    adminNotes?: string,
    discountByPoints?: { pointsUsed: number; amountDeducted: number },
  ): void {
    if (this.props.status !== BookingStatus.APPROVED) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.COMPLETED);
    }

    for (const line of this.props.lines) {
      const actual = lineActualPrices.get(line.lineId) ?? line.priceAtBooking;
      line.setActualPrice(actual);
    }

    const linesTotal = this.props.lines.reduce(
      (sum, l) => sum.add(l.actualPriceCharged!),
      Money.zero(this.props.totalPrice.currency),
    );

    let totalActualPrice = linesTotal;
    let discountAmount: Money | null = null;
    if (discountByPoints) {
      discountAmount = Money.from(discountByPoints.amountDeducted, this.props.totalPrice.currency);
      if (discountAmount.isGreaterThan(linesTotal)) throw new BookingDiscountExceedsTotalError();
      totalActualPrice = linesTotal.subtract(discountAmount);
    }

    this._linesModified = true;
    this.props.status = BookingStatus.COMPLETED;
    this.props.completedAt = new Date();
    this.props.completedBy = staffId;
    this.props.totalActualPrice = totalActualPrice;
    this.props.discountPointsUsed = discountByPoints?.pointsUsed ?? null;
    this.props.discountAmount = discountAmount;
    this.props.afterServicePhotoUrls = [...afterPhotos];
    if (adminNotes !== undefined) this.props.adminNotes = normalizeOptionalText(adminNotes);

    const endTime = new Date(
      this.props.scheduledAt.getTime() + this.props.totalDurationMins * 60_000,
    );

    this.addDomainEvent(
      new BookingCompleted(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: this.props.customerId,
        contactEmail: this.props.contactEmail.address,
        contactName: this.props.contactName,
        completedSlot: {
          startTime: this.props.scheduledAt.toISOString(),
          endTime: endTime.toISOString(),
        },
        completedBy: staffId,
        afterServicePhotoUrls: [...afterPhotos],
        adminNotes: this.props.adminNotes,
        pickupAddress: Booking.toAddressPayload(this.props.pickupAddress),
        totalPrice: {
          amount: this.props.totalPrice.amount.toFixed(2),
          currency: this.props.totalPrice.currency,
        },
        totalActualPrice: {
          amount: totalActualPrice.amount.toFixed(2),
          currency: totalActualPrice.currency,
        },
        lines: this.props.lines.map((l) => ({
          lineId: l.lineId,
          serviceId: l.serviceId,
          priceAtBooking: {
            amount: l.priceAtBooking.amount.toFixed(2),
            currency: l.priceAtBooking.currency,
          },
          actualPriceCharged: {
            amount: l.actualPriceCharged!.amount.toFixed(2),
            currency: l.actualPriceCharged!.currency,
          },
          pointsValueAtBooking: l.pointsValueAtBooking,
        })),
        discountByPoints: discountByPoints
          ? {
              pointsUsed: discountByPoints.pointsUsed,
              amountDeducted: {
                amount: discountAmount!.amount.toFixed(2),
                currency: discountAmount!.currency,
              },
            }
          : undefined,
      }),
    );
  }

  cancel(cancelledBy: string, isBusiness: boolean, correlationId: string, reason?: string): void {
    const cancellable = [
      BookingStatus.PENDING,
      BookingStatus.INFO_REQUESTED,
      BookingStatus.APPROVED,
    ];
    if (!cancellable.includes(this.props.status)) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.CANCELLED);
    }

    this.props.status = BookingStatus.CANCELLED;
    this.props.cancelledAt = new Date();
    this.props.cancelledBy = cancelledBy;
    this.props.cancellationReason = reason ?? null;

    this.addDomainEvent(
      new BookingCancelled(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: this.props.customerId,
        contactEmail: this.props.contactEmail.address,
        contactName: this.props.contactName,
        cancelledBy,
        isBusiness,
        reason: reason ?? null,
        scheduledAt: this.props.scheduledAt.toISOString(),
        lineSummary: this.lineSummaryPayload(),
        totalPrice: this.totalPricePayload(),
      }),
    );
  }

  reschedule(
    staffId: string,
    newScheduledAt: Date,
    correlationId: string,
    adminNotes?: string,
  ): void {
    if (this.props.status !== BookingStatus.APPROVED) {
      throw new InvalidBookingTransitionError(this.props.status, BookingStatus.APPROVED);
    }

    const previousEndTime = new Date(
      this.props.scheduledAt.getTime() + this.props.totalDurationMins * 60_000,
    );
    const newEndTime = new Date(newScheduledAt.getTime() + this.props.totalDurationMins * 60_000);

    const previousSlot = {
      startTime: this.props.scheduledAt.toISOString(),
      endTime: previousEndTime.toISOString(),
    };

    this.props.scheduledAt = newScheduledAt;
    if (adminNotes !== undefined) this.props.adminNotes = normalizeOptionalText(adminNotes);

    this.addDomainEvent(
      new BookingRescheduled(this.props.tenantId, correlationId, {
        bookingId: this.props.id,
        customerId: this.props.customerId,
        contactEmail: this.props.contactEmail.address,
        contactName: this.props.contactName,
        newSlot: {
          startTime: newScheduledAt.toISOString(),
          endTime: newEndTime.toISOString(),
        },
        previousSlot,
        rescheduledBy: staffId,
        adminNotes: this.props.adminNotes,
        lineSummary: this.lineSummaryPayload(),
        totalPrice: this.totalPricePayload(),
      }),
    );
  }

  private lineSummaryPayload() {
    return this.props.lines.map((l) => ({
      serviceId: l.serviceId,
      serviceNameAtBooking: l.serviceNameAtBooking,
      priceAtBooking: {
        amount: l.priceAtBooking.amount.toFixed(2),
        currency: l.priceAtBooking.currency,
      },
    }));
  }

  private totalPricePayload() {
    return {
      amount: this.props.totalPrice.amount.toFixed(2),
      currency: this.props.totalPrice.currency,
    };
  }

  private static toAddressPayload(addr: Address | null) {
    if (!addr) return null;
    const j = addr.toJSON();
    return {
      street: j.street,
      number: j.number,
      complement: j.complement ?? null,
      neighborhood: j.neighborhood ?? null,
      city: j.city,
      state: j.state,
      zipCode: j.zipCode,
    };
  }

  cancellableUntil(cancellationWindowHours: number): Date {
    const windowMs = cancellationWindowHours * 60 * 60 * 1000;
    return new Date(this.props.scheduledAt.getTime() - windowMs);
  }

  // Customer-facing self-cancellation deadline (UC-007) — non-null only for APPROVED
  // bookings. Single-sourced here so list/detail read models never drift from each other.
  cancellableUntilIso(cancellationWindowHours: number): string | null {
    return this.props.status === BookingStatus.APPROVED
      ? this.cancellableUntil(cancellationWindowHours).toISOString()
      : null;
  }

  isEligibleForCancellation(cancellationWindowHours: number): boolean {
    return Date.now() < this.cancellableUntil(cancellationWindowHours).getTime();
  }

  pointsEarned(): number {
    return this.props.lines.reduce((sum, l) => sum + l.pointsValueAtBooking, 0);
  }

  markPersisted(version: number): void {
    this.props.version = version;
    this._linesModified = false;
  }

  static reconstitute(props: BookingProps, linesModified = false): Booking {
    const booking = new Booking(props);
    booking._linesModified = linesModified;
    return booking;
  }
}
