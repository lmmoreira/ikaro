import { createHash } from 'node:crypto';

const METADATA_BASE_URL = 'http://metadata.google.internal/computeMetadata/v1';
const IAM_CREDENTIALS_BASE_URL =
  'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts';
const STORAGE_HOST = 'storage.googleapis.com';
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' };
const SIGNING_REQUEST_TIMEOUT_MS = 5000;

type MetadataTokenResponse = {
  access_token: string;
};

type SignBlobResponse = {
  signedBlob: string;
};

export class CloudRunGcsV4Signer {
  async getSignedUrl(
    bucketName: string,
    storagePath: string,
    method: 'GET' | 'PUT',
    expiresAt: Date,
    contentType?: string,
  ): Promise<string> {
    const [serviceAccountEmail, accessToken] = await Promise.all([
      this.getMetadataText('instance/service-accounts/default/email'),
      this.getAccessToken(),
    ]);
    const accessibleAt = new Date();
    const isoDate = formatIsoDate(accessibleAt);
    const date = isoDate.slice(0, 8);
    const credentialScope = `${date}/auto/storage/goog4_request`;
    const canonicalUri = `/${encodePathSegment(bucketName)}/${encodeStoragePath(storagePath)}`;
    const canonicalHeaders = contentType
      ? `content-type:${contentType}\nhost:${STORAGE_HOST}\n`
      : `host:${STORAGE_HOST}\n`;
    const signedHeaders = contentType ? 'content-type;host' : 'host';
    const expiresInSeconds = Math.floor((expiresAt.getTime() - accessibleAt.getTime()) / 1000);
    const query = [
      ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
      ['X-Goog-Credential', `${serviceAccountEmail}/${credentialScope}`],
      ['X-Goog-Date', isoDate],
      ['X-Goog-Expires', String(expiresInSeconds)],
      ['X-Goog-SignedHeaders', signedHeaders],
    ]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
      .join('&');
    const canonicalRequest = [
      method,
      canonicalUri,
      query,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'GOOG4-RSA-SHA256',
      isoDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');
    const signedBlob = await this.signBlob(serviceAccountEmail, accessToken, stringToSign);
    const signature = Buffer.from(signedBlob, 'base64').toString('hex');

    return `https://${STORAGE_HOST}${canonicalUri}?${query}&X-Goog-Signature=${signature}`;
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetchWithTimeout(
      `${METADATA_BASE_URL}/instance/service-accounts/default/token`,
      { headers: METADATA_HEADERS },
      'metadata token request',
    );
    const body = await readResponse<MetadataTokenResponse>(response, 'metadata token');
    return body.access_token;
  }

  private async getMetadataText(path: string): Promise<string> {
    const response = await fetchWithTimeout(
      `${METADATA_BASE_URL}/${path}`,
      { headers: METADATA_HEADERS },
      'metadata request',
    );
    return readResponseText(response, 'metadata value');
  }

  private async signBlob(email: string, accessToken: string, payload: string): Promise<string> {
    const response = await fetchWithTimeout(
      `${IAM_CREDENTIALS_BASE_URL}/${encodePathSegment(email)}:signBlob`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: Buffer.from(payload).toString('base64') }),
      },
      'IAM signBlob request',
    );
    const body = await readResponse<SignBlobResponse>(response, 'IAM signBlob');
    return body.signedBlob;
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(SIGNING_REQUEST_TIMEOUT_MS) });
  } catch (error: unknown) {
    if (isAbortError(error)) throw new Error(`${operation} timed out`);
    throw error;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    ((error as { name?: unknown }).name === 'AbortError' ||
      (error as { name?: unknown }).name === 'TimeoutError')
  );
}

function formatIsoDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodePathSegment).join('/');
}

function encodePathSegment(value: string): string {
  return encodeQueryValue(value);
}

function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase()}`,
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readResponse<T>(response: Response, operation: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) throw new Error(`${operation} failed with status ${response.status}: ${body}`);
  return JSON.parse(body) as T;
}

async function readResponseText(response: Response, operation: string): Promise<string> {
  const body = await response.text();
  if (!response.ok) throw new Error(`${operation} failed with status ${response.status}: ${body}`);
  return body.trim();
}
