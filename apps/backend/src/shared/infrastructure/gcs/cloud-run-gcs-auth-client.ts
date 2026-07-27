const METADATA_BASE_URL = 'http://metadata.google.internal/computeMetadata/v1';
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' };
const AUTH_REQUEST_TIMEOUT_MS = 5000;

type MetadataTokenResponse = {
  access_token: string;
  expires_in?: number;
};

/** Auth client that avoids the broken nested gcp-metadata dependency in Storage. */
export class CloudRunGcsAuthClient {
  private serviceAccountEmail: string | undefined;
  private accessToken: { token: string; expiryDate: number } | undefined;

  async getAccessToken(): Promise<{ token: string }> {
    if (this.accessToken && this.accessToken.expiryDate > Date.now() + 60_000) {
      return { token: this.accessToken.token };
    }
    const response = await fetchWithTimeout(
      `${METADATA_BASE_URL}/instance/service-accounts/default/token`,
      { headers: METADATA_HEADERS },
      'metadata token request',
    );
    const body = await readResponse<MetadataTokenResponse>(response, 'metadata token');
    const expiryDate = Date.now() + (body.expires_in ?? 3600) * 1000;
    this.accessToken = { token: body.access_token, expiryDate };
    return { token: body.access_token };
  }

  async getRequestHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token.token}` };
  }

  async getProjectId(): Promise<string> {
    const configuredProject = process.env['GCP_PROJECT'];
    if (configuredProject) return configuredProject;

    const response = await fetchWithTimeout(
      `${METADATA_BASE_URL}/project/project-id`,
      { headers: METADATA_HEADERS },
      'metadata project request',
    );
    return readResponseText(response, 'metadata project');
  }

  async getServiceAccountEmail(): Promise<string> {
    if (this.serviceAccountEmail) return this.serviceAccountEmail;
    const response = await fetchWithTimeout(
      `${METADATA_BASE_URL}/instance/service-accounts/default/email`,
      { headers: METADATA_HEADERS },
      'metadata service account request',
    );
    this.serviceAccountEmail = await readResponseText(response, 'metadata service account');
    return this.serviceAccountEmail;
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error(`${operation} timed out`);
    }
    throw error;
  }
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
