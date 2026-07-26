import { CloudRunGcsV4Signer } from './cloud-run-gcs-v4-signer';

describe('CloudRunGcsV4Signer', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-26T14:00:00.000Z'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('generates a V4 URL after obtaining metadata credentials and signing with IAM', async () => {
    const signedBlob = Buffer.from('signature').toString('base64');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('ikaro-backend@ikaro-staging.iam.gserviceaccount.com'),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ access_token: 'token' })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ signedBlob })),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const url = await new CloudRunGcsV4Signer().getSignedUrl(
      'ikaro-uploads-staging',
      'tenants/t1/my file.txt',
      'PUT',
      new Date('2026-07-26T14:15:00.000Z'),
      'text/plain',
    );

    expect(url).toContain(
      'https://storage.googleapis.com/ikaro-uploads-staging/tenants/t1/my%20file.txt?',
    );
    expect(url).toContain('X-Goog-Algorithm=GOOG4-RSA-SHA256');
    expect(url).toContain('X-Goog-SignedHeaders=content-type%3Bhost');
    expect(url).toContain(`X-Goog-Signature=${Buffer.from('signature').toString('hex')}`);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(':signBlob'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });
});
