import { CloudRunGcsV4Signer } from './cloud-run-gcs-v4-signer';

describe('CloudRunGcsV4Signer', () => {
  const originalFetch = global.fetch;

  class FetchResponseDouble {
    private readonly responses: Response[];
    readonly requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];

    constructor(responses: Response[]) {
      this.responses = [...responses];
    }

    build(): typeof fetch {
      return async (input, init) => {
        this.requests.push({ input, init });
        const response = this.responses.shift();
        if (!response) throw new Error('Unexpected fetch request');
        return response;
      };
    }
  }

  class FetchResponseDoubleBuilder {
    private readonly responses: Response[] = [];

    withResponse(body: string, options: { ok?: boolean; status?: number } = {}): this {
      this.responses.push({
        ok: options.ok ?? true,
        status: options.status ?? 200,
        text: async () => body,
      } as Response);
      return this;
    }

    build(): FetchResponseDouble {
      return new FetchResponseDouble(this.responses);
    }
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-26T14:00:00.000Z'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('generates a V4 URL after obtaining metadata credentials and signing with IAM', async () => {
    const signedBlob = Buffer.from('signature').toString('base64');
    const fetchDouble = new FetchResponseDoubleBuilder()
      .withResponse('ikaro-backend@ikaro-staging.iam.gserviceaccount.com')
      .withResponse(JSON.stringify({ access_token: 'token' }))
      .withResponse(JSON.stringify({ signedBlob }))
      .build();
    global.fetch = fetchDouble.build();

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
    expect(fetchDouble.requests).toHaveLength(3);
    expect(fetchDouble.requests[0]).toMatchObject({
      input:
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
      init: { headers: { 'Metadata-Flavor': 'Google' }, signal: expect.any(AbortSignal) },
    });
    expect(fetchDouble.requests[2]).toMatchObject({
      input: expect.stringContaining(':signBlob'),
      init: {
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        signal: expect.any(AbortSignal),
      },
    });
  });
});
