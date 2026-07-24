const mockGetOptions = jest.fn();
const mockClose = jest.fn();
const mockConnectorCtor = jest.fn().mockImplementation(() => ({
  getOptions: mockGetOptions,
  close: mockClose,
}));

jest.mock('@google-cloud/cloud-sql-connector', () => ({
  Connector: mockConnectorCtor,
  IpAddressTypes: { PRIVATE: 'PRIVATE', PUBLIC: 'PUBLIC', PSC: 'PSC' },
}));

import {
  closeCloudSqlConnector,
  CloudSqlConnectorShutdownHook,
  getCloudSqlConnectorExtra,
} from './cloud-sql-connector.adapter';

describe('getCloudSqlConnectorExtra', () => {
  const fakeStream = () => ({}) as never;

  beforeEach(() => {
    closeCloudSqlConnector();
    jest.clearAllMocks();
    mockGetOptions.mockResolvedValue({ stream: fakeStream });
  });

  it('requests PRIVATE ip connection options for the given instance connection name', async () => {
    const extra = await getCloudSqlConnectorExtra('proj:region:instance');

    expect(mockGetOptions).toHaveBeenCalledWith({
      instanceConnectionName: 'proj:region:instance',
      ipType: 'PRIVATE',
    });
    expect(extra).toEqual({ stream: fakeStream });
  });

  it('reuses a single Connector instance across multiple calls', async () => {
    await getCloudSqlConnectorExtra('proj:region:instance-a');
    await getCloudSqlConnectorExtra('proj:region:instance-b');

    expect(mockConnectorCtor).toHaveBeenCalledTimes(1);
    expect(mockGetOptions).toHaveBeenCalledTimes(2);
  });

  it('creates a fresh Connector after closeCloudSqlConnector() releases the previous one', async () => {
    await getCloudSqlConnectorExtra('proj:region:instance');
    closeCloudSqlConnector();
    await getCloudSqlConnectorExtra('proj:region:instance');

    expect(mockConnectorCtor).toHaveBeenCalledTimes(2);
  });

  it('rejects with a diagnosable error when getOptions() hangs past the timeout', async () => {
    jest.useFakeTimers();
    // Never resolves — simulates a hung Cloud SQL Admin API / metadata server call.
    mockGetOptions.mockReturnValue(new Promise(() => undefined));

    const result = getCloudSqlConnectorExtra('proj:region:instance');
    const assertion = expect(result).rejects.toThrow(
      'Cloud SQL Connector getOptions() timed out after 15000ms for instance "proj:region:instance"',
    );
    await jest.advanceTimersByTimeAsync(15_000);
    await assertion;

    jest.useRealTimers();
  });
});

describe('closeCloudSqlConnector', () => {
  beforeEach(() => {
    // Reset module state (may invoke the still-live mock from the previous test) BEFORE clearing
    // mock call counts — otherwise this cleanup's own close() call would count toward the next
    // test's assertions.
    closeCloudSqlConnector();
    jest.clearAllMocks();
    mockGetOptions.mockResolvedValue({ stream: () => ({}) as never });
  });

  it('closes the underlying Connector when one has been created', async () => {
    await getCloudSqlConnectorExtra('proj:region:instance');

    closeCloudSqlConnector();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no Connector has been created yet', () => {
    expect(() => closeCloudSqlConnector()).not.toThrow();
    expect(mockClose).not.toHaveBeenCalled();
  });
});

describe('CloudSqlConnectorShutdownHook', () => {
  beforeEach(() => {
    // Reset module state (may invoke the still-live mock from the previous test) BEFORE clearing
    // mock call counts — otherwise this cleanup's own close() call would count toward the next
    // test's assertions.
    closeCloudSqlConnector();
    jest.clearAllMocks();
    mockGetOptions.mockResolvedValue({ stream: () => ({}) as never });
  });

  it('closes the Connector on onModuleDestroy', async () => {
    await getCloudSqlConnectorExtra('proj:region:instance');

    new CloudSqlConnectorShutdownHook().onModuleDestroy();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
