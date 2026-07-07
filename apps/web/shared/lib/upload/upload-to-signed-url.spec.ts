import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SignedUrlUploadFailedError,
  UnsupportedFileTypeError,
  uploadFileToSignedUrl,
} from './upload-to-signed-url';

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

describe('uploadFileToSignedUrl', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('requests a signed URL, PUTs the file, and returns the filePath', async () => {
    const requestSignedUrl = vi.fn().mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/t-1/hotsite/logo.png',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    const filePath = await uploadFileToSignedUrl(
      makeFile('logo.png', 'image/png'),
      requestSignedUrl,
    );

    expect(requestSignedUrl).toHaveBeenCalledWith('logo.png', 'image/png');
    expect(fetchSpy).toHaveBeenCalledWith('https://storage.example.com/upload?sig=abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: expect.any(File),
    });
    expect(filePath).toBe('tenants/t-1/hotsite/logo.png');
  });

  it('throws UnsupportedFileTypeError for a content type outside the allowed set, without calling requestSignedUrl', async () => {
    const requestSignedUrl = vi.fn();

    await expect(
      uploadFileToSignedUrl(makeFile('doc.pdf', 'application/pdf'), requestSignedUrl),
    ).rejects.toThrow(UnsupportedFileTypeError);

    expect(requestSignedUrl).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws SignedUrlUploadFailedError when the PUT response is not ok', async () => {
    const requestSignedUrl = vi.fn().mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/t-1/hotsite/logo.png',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      uploadFileToSignedUrl(makeFile('logo.png', 'image/png'), requestSignedUrl),
    ).rejects.toThrow(SignedUrlUploadFailedError);
  });

  it('respects a caller-supplied allowed content type set', async () => {
    const requestSignedUrl = vi.fn().mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload',
      filePath: 'tenants/t-1/docs/report.pdf',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    const filePath = await uploadFileToSignedUrl(
      makeFile('report.pdf', 'application/pdf'),
      requestSignedUrl,
      new Set(['application/pdf']),
    );

    expect(filePath).toBe('tenants/t-1/docs/report.pdf');
  });
});
