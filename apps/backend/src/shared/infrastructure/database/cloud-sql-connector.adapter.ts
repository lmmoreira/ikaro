import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import type { DataSourceOptions } from 'typeorm';

// PORTABILITY (TD33): the only file in the codebase allowed to import
// @google-cloud/cloud-sql-connector (anti-lock-in guardrail #1, plan/M17-CLOUD-DEPLOY.md §0).
// A single module-level Connector reuses its ephemeral-cert cache/refresh across every
// connection this process opens instead of re-fetching per DataSource.
let connector: Connector | undefined;

function getConnector(): Connector {
  connector ??= new Connector();
  return connector;
}

// Bounds the Cloud SQL Admin API round-trip so a hung/unreachable admin API or metadata server
// fails app/CLI startup fast with a diagnosable error instead of hanging indefinitely (CodeRabbit
// finding, PR #202).
const GET_OPTIONS_TIMEOUT_MS = 15_000;

/**
 * Returns the `DataSourceOptions.extra` fragment that routes a TypeORM postgres connection
 * through the Cloud SQL Connector instead of a plain TCP host/port. ipType is always PRIVATE —
 * the instance has no public IP and must never gain one via this path.
 */
export async function getCloudSqlConnectorExtra(
  instanceConnectionName: string,
): Promise<DataSourceOptions['extra']> {
  const { stream } = await Promise.race([
    getConnector().getOptions({ instanceConnectionName, ipType: IpAddressTypes.PRIVATE }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Cloud SQL Connector getOptions() timed out after ${GET_OPTIONS_TIMEOUT_MS}ms for instance "${instanceConnectionName}"`,
            ),
          ),
        GET_OPTIONS_TIMEOUT_MS,
      ),
    ),
  ]);
  return { stream };
}

/** Releases the Connector's local proxy sockets — call on process/app shutdown. */
export function closeCloudSqlConnector(): void {
  connector?.close();
  connector = undefined;
}

// Registered as a provider in AppModule so Nest's app.enableShutdownHooks() (main.ts) releases
// the Connector's background cert-refresh timers on SIGTERM — a no-op when the connector was
// never created (e.g. APP_ENV=local never calls getCloudSqlConnectorExtra).
@Injectable()
export class CloudSqlConnectorShutdownHook implements OnModuleDestroy {
  onModuleDestroy(): void {
    closeCloudSqlConnector();
  }
}
