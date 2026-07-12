import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a signed upload url for allowed content types', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1712345678901);
    const controller = new UploadsController();

    const result = controller.getSignedUrl({
      contentType: 'image/jpeg',
      filename: 'car.jpg',
    });

    expect(result).toEqual({
      uploadUrl: 'http://localhost:4443/ikaro-local/uploads/1712345678901-car.jpg',
      key: 'uploads/1712345678901-car.jpg',
      expiresIn: 900,
    });
  });

  it('sanitizes filename path segments before building the storage key', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1712345678901);
    const controller = new UploadsController();

    const result = controller.getSignedUrl({
      contentType: 'image/png',
      filename: '../unsafe/../car?.png',
    });

    expect(result.key).toBe('uploads/1712345678901-car_.png');
    expect(result.uploadUrl).toBe(
      'http://localhost:4443/ikaro-local/uploads/1712345678901-car_.png',
    );
  });

  // contentType/filename validation now happens at ZodValidationPipe (request-boundary) —
  // covered end-to-end in uploads.controller.component.spec.ts, not here.
});
