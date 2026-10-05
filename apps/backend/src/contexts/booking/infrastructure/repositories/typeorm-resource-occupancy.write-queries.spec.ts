import { getMetadataArgsStorage } from 'typeorm';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { ResourceType } from '../../domain/resource.types';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import {
  buildOccupancyRows,
  INSERT_FRESH_ASSIGNMENTS_SQL,
  INSERT_OCCUPANCY_SQL,
} from './typeorm-resource-occupancy.write-queries';

// The two bulk INSERTs list their columns by hand (an unnested multi-row insert cannot be derived
// from the entity the way manager.insert() does). These guards fail the moment an entity gains or
// loses a column without the SQL following, instead of the column silently missing from every
// bulk-inserted row.
function databaseColumns(entity: abstract new () => object): string[] {
  return getMetadataArgsStorage()
    .filterColumns(entity)
    .map((column) => column.options.name ?? column.propertyName)
    .sort();
}

function insertedColumns(sql: string): string[] {
  const list = /INSERT INTO\s+\S+\s*\(([^)]+)\)/.exec(sql)?.[1] ?? '';
  return list
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
    .sort();
}

describe('resource_occupancy bulk INSERT statements', () => {
  it('INSERT_OCCUPANCY_SQL lists exactly the columns of ResourceOccupancyEntity', () => {
    expect(insertedColumns(INSERT_OCCUPANCY_SQL)).toEqual(databaseColumns(ResourceOccupancyEntity));
  });

  it('INSERT_FRESH_ASSIGNMENTS_SQL lists exactly the columns of BookingLineResourceAssignmentEntity', () => {
    expect(insertedColumns(INSERT_FRESH_ASSIGNMENTS_SQL)).toEqual(
      databaseColumns(BookingLineResourceAssignmentEntity),
    );
  });

  it('INSERT_OCCUPANCY_SQL unnests one array per inserted column', () => {
    const parameters = INSERT_OCCUPANCY_SQL.match(/\$\d+::/g) ?? [];

    expect(parameters).toHaveLength(insertedColumns(INSERT_OCCUPANCY_SQL).length);
  });

  it('buildOccupancyRows copies the gap minutes and origin from each candidate (M18-S10)', () => {
    const candidate = (gapMinutes: number | null, gapSource: 'SERVICE_BUFFER' | null) => ({
      resourceId: 'resource-1',
      resourceType: ResourceType.ROOM,
      resourceName: 'Sala',
      legIndex: null,
      quantityPosition: null,
      startsAt: new Date('2026-06-01T10:00:00.000Z'),
      endsAt: new Date('2026-06-01T11:00:00.000Z'),
      gapMinutes,
      gapSource,
      selectionMode: 'NONE' as const,
      isBundleMember: false,
    });

    const rows = buildOccupancyRows([candidate(15, 'SERVICE_BUFFER'), candidate(null, null)], {
      tenantId: 'tenant-1',
      assignmentIds: new Map([['resource-1|-1|-1', 'assignment-1']]),
      lockState: 'COMMITTED',
      holdExpiresAt: null,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(rows.map((r) => [r.gapMinutes, r.gapSource])).toEqual([
      [15, 'SERVICE_BUFFER'],
      [null, null],
    ]);
  });
});
