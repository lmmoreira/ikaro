import { fetchWithTimeout, readResponse, readResponseText } from './cloud-run-gcs-http';

const METADATA_BASE_URL = 'http://metadata.google.internal/computeMetadata/v1';
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' };

type MetadataTokenResponse = {
  access_token: string;
  expires_in?: number;
};

/** Auth client that avoids the broken nested gcp-metadata dependency in Storage. */
export class CloudRunGcsAuthClient {
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
}
