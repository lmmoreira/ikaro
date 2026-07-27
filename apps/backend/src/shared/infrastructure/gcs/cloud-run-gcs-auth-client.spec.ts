import { CloudRunGcsAuthClient } from './cloud-run-gcs-auth-client';

describe('CloudRunGcsAuthClient', () => {
  const originalFetch = global.fetch;
  const originalProject = process.env['GCP_PROJECT'];

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalProject === undefined) delete process.env['GCP_PROJECT'];
    else process.env['GCP_PROJECT'] = originalProject;
  });

  it('fetches and caches a metadata access token with the required header', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 }),
      );
    global.fetch = fetchMock;
    const client = new CloudRunGcsAuthClient();

    await expect(client.getRequestHeaders()).resolves.toEqual({ Authorization: 'Bearer token' });
    await expect(client.getRequestHeaders()).resolves.toEqual({ Authorization: 'Bearer token' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/instance/service-accounts/default/token'),
      expect.objectContaining({ headers: { 'Metadata-Flavor': 'Google' } }),
    );
  });

  it('uses the configured project without a metadata request', async () => {
    process.env['GCP_PROJECT'] = 'ikaro-staging';
    global.fetch = jest.fn();

    await expect(new CloudRunGcsAuthClient().getProjectId()).resolves.toBe('ikaro-staging');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
