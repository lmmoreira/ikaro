import { fetchWithTimeout, readResponse, readResponseText } from './cloud-run-gcs-http';

describe('Cloud Run GCS HTTP helpers', () => {
  it('converts timeout errors into an operation-specific error', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      const timeoutError = new Error('timed out');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    };

    await expect(fetchWithTimeout('http://metadata', {}, 'metadata request')).rejects.toThrow(
      'metadata request timed out',
    );
    global.fetch = originalFetch;
  });

  it('rethrows non-timeout fetch errors', async () => {
    const originalFetch = global.fetch;
    const error = new Error('network unavailable');
    global.fetch = async () => {
      throw error;
    };

    await expect(fetchWithTimeout('http://metadata', {}, 'metadata request')).rejects.toBe(error);
    global.fetch = originalFetch;
  });

  it('reports non-success JSON and text responses', async () => {
    await expect(readResponse(new Response('bad', { status: 500 }), 'metadata')).rejects.toThrow(
      'metadata failed with status 500: bad',
    );
    await expect(readResponseText(new Response('bad', { status: 404 }), 'project')).rejects.toThrow(
      'project failed with status 404: bad',
    );
  });
});
