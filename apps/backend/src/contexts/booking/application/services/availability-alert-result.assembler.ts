import { Inject, Injectable } from '@nestjs/common';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  AvailabilityAlertResult,
  toAvailabilityAlertResult,
} from '../use-cases/availability-alert-input.helpers';

// Turns alerts into the wire shape every alert route returns (list, by-id, create, update), so the
// four shapes cannot drift. The service names, resource names and sent times are read once for the
// whole set — three tenant-scoped queries, never one per alert (M23-S43).
@Injectable()
export class AvailabilityAlertResultAssembler {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
  ) {}

  async assemble(
    tenantId: string,
    alerts: AvailabilityAlert[],
  ): Promise<AvailabilityAlertResult[]> {
    if (alerts.length === 0) return [];
    const serviceIds = [...new Set(alerts.map((a) => a.serviceId))];
    const resourceIds = [
      ...new Set(alerts.flatMap((a) => (a.preferredResourceId ? [a.preferredResourceId] : []))),
    ];
    const [services, resources, sentAt] = await Promise.all([
      this.serviceRepo.findByIds(serviceIds, tenantId),
      this.resourceRepo.findByIds(resourceIds, tenantId),
      this.alertRepo.findSentAtByAlertIds(
        tenantId,
        alerts.map((a) => a.id),
      ),
    ]);
    // Every alert's service and preferred resource exist: the composite FKs (tenant_id,
    // service_id) and (tenant_id, preferred_resource_id) guarantee it, and neither lookup filters
    // inactive rows, so a missing name is a broken invariant, not a case to handle.
    const serviceNames = new Map(services.map((s) => [s.id, s.name]));
    const resourceNames = new Map(resources.map((r) => [r.id, r.name]));
    return alerts.map((alert) => {
      const serviceName = serviceNames.get(alert.serviceId);
      if (serviceName === undefined) {
        throw new Error(`Service ${alert.serviceId} of availability alert ${alert.id} not found`);
      }
      let preferredResourceName: string | null = null;
      if (alert.preferredResourceId) {
        preferredResourceName = resourceNames.get(alert.preferredResourceId) ?? null;
        if (preferredResourceName === null) {
          throw new Error(
            `Resource ${alert.preferredResourceId} of availability alert ${alert.id} not found`,
          );
        }
      }
      return toAvailabilityAlertResult(alert, {
        serviceName,
        preferredResourceName,
        notifiedAt: sentAt.get(alert.id) ?? null,
      });
    });
  }

  async assembleOne(tenantId: string, alert: AvailabilityAlert): Promise<AvailabilityAlertResult> {
    const [result] = await this.assemble(tenantId, [alert]);
    return result as AvailabilityAlertResult;
  }
}
