import { getMetadataArgsStorage } from 'typeorm';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import {
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
});
