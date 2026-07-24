const mockGetCloudSqlConnectorExtra = jest.fn();

jest.mock('../infrastructure/database/cloud-sql-connector.adapter', () => ({
  getCloudSqlConnectorExtra: (...args: unknown[]) => mockGetCloudSqlConnectorExtra(...args),
}));

import {
  type BaseDataSourceOptions,
  buildDataSourceOptions,
  requireEnv,
} from './build-data-source-options';

describe('requireEnv', () => {
  it('does not throw when all keys are present', () => {
    expect(() => requireEnv({ A: '1', B: '2' } as NodeJS.ProcessEnv, ['A', 'B'])).not.toThrow();
  });

  it('throws listing every missing key', () => {
    expect(() => requireEnv({ A: '1' } as NodeJS.ProcessEnv, ['A', 'B', 'C'])).toThrow(
      'Missing required environment variables: B, C',
    );
  });
});

describe('buildDataSourceOptions', () => {
  const base: BaseDataSourceOptions = {
    type: 'postgres',
    username: 'ikaro_migrator',
    password: 'secret',
    database: 'ikaro',
    synchronize: false,
    migrationsRun: false,
    logging: ['error'],
    entities: [],
    migrations: [],
    subscribers: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('APP_ENV=local (default)', () => {
    it('builds host/port options from DB_HOST/DB_PORT', async () => {
      const options = await buildDataSourceOptions(
        {
          DB_HOST: 'localhost',
          DB_PORT: '5433',
          DB_MIGRATOR_USER: 'ikaro_migrator',
          DB_MIGRATOR_PASSWORD: 'secret',
          DB_NAME: 'ikaro',
        } as NodeJS.ProcessEnv,
        base,
      );

      expect(options).toEqual({ ...base, host: 'localhost', port: 5433 });
      expect(mockGetCloudSqlConnectorExtra).not.toHaveBeenCalled();
    });

    it('defaults DB_PORT to 5432 when unset', async () => {
      const options = await buildDataSourceOptions(
        {
          DB_HOST: 'localhost',
          DB_MIGRATOR_USER: 'ikaro_migrator',
          DB_MIGRATOR_PASSWORD: 'secret',
          DB_NAME: 'ikaro',
        } as NodeJS.ProcessEnv,
        base,
      );

      expect(options).toMatchObject({ port: 5432 });
    });

    it('treats an unset APP_ENV the same as "local"', async () => {
      const options = await buildDataSourceOptions(
        {
          DB_HOST: 'localhost',
          DB_MIGRATOR_USER: 'ikaro_migrator',
          DB_MIGRATOR_PASSWORD: 'secret',
          DB_NAME: 'ikaro',
        } as NodeJS.ProcessEnv,
        base,
      );

      expect(options).toMatchObject({ host: 'localhost' });
    });

    it('throws when DB_HOST is missing', async () => {
      await expect(
        buildDataSourceOptions(
          {
            APP_ENV: 'local',
            DB_MIGRATOR_USER: 'ikaro_migrator',
            DB_MIGRATOR_PASSWORD: 'secret',
            DB_NAME: 'ikaro',
          } as NodeJS.ProcessEnv,
          base,
        ),
      ).rejects.toThrow('Missing required environment variables: DB_HOST');
    });
  });

  describe('APP_ENV=staging/production', () => {
    it('builds Cloud SQL Connector options from DB_INSTANCE_CONNECTION_NAME', async () => {
      const fakeExtra = { stream: () => ({}) as never };
      mockGetCloudSqlConnectorExtra.mockResolvedValue(fakeExtra);

      const options = await buildDataSourceOptions(
        {
          APP_ENV: 'staging',
          DB_INSTANCE_CONNECTION_NAME: 'proj:region:instance',
          DB_MIGRATOR_USER: 'ikaro_migrator',
          DB_MIGRATOR_PASSWORD: 'secret',
          DB_NAME: 'ikaro',
        } as NodeJS.ProcessEnv,
        base,
      );

      expect(mockGetCloudSqlConnectorExtra).toHaveBeenCalledWith('proj:region:instance');
      expect(options).toEqual({ ...base, extra: fakeExtra });
    });

    it('throws when DB_INSTANCE_CONNECTION_NAME is missing', async () => {
      await expect(
        buildDataSourceOptions(
          {
            APP_ENV: 'production',
            DB_MIGRATOR_USER: 'ikaro_migrator',
            DB_MIGRATOR_PASSWORD: 'secret',
            DB_NAME: 'ikaro',
          } as NodeJS.ProcessEnv,
          base,
        ),
      ).rejects.toThrow('Missing required environment variables: DB_INSTANCE_CONNECTION_NAME');
      expect(mockGetCloudSqlConnectorExtra).not.toHaveBeenCalled();
    });
  });
});
