import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '../bff-client';
import {
  featureBookingPhoto,
  generateHotsiteImageSignedUrl,
  getHotsiteConfig,
  publishHotsite,
  unpublishHotsite,
  updateHotsiteConfig,
} from './tenants';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const hotsiteConfig = { id: 'h-1', branding: {}, modules: [], seo: {} };

describe('getHotsiteConfig', () => {
  it('calls GET /platform/hotsite', async () => {
    mock.onGet('/platform/hotsite').reply(200, hotsiteConfig);
    const res = await getHotsiteConfig();
    expect(res).toMatchObject(hotsiteConfig);
  });
});

describe('updateHotsiteConfig', () => {
  it('calls PATCH /platform/hotsite', async () => {
    mock.onPatch('/platform/hotsite').reply(200, hotsiteConfig);
    const res = await updateHotsiteConfig({ branding: { brandName: 'Acme' } });
    expect(res).toMatchObject(hotsiteConfig);
  });
});

describe('publishHotsite', () => {
  it('calls POST /platform/hotsite/publish', async () => {
    mock.onPost('/platform/hotsite/publish').reply(200, { publishedAt: '2026-07-01T00:00:00Z' });
    const res = await publishHotsite();
    expect(res).toMatchObject({ publishedAt: '2026-07-01T00:00:00Z' });
  });
});

describe('unpublishHotsite', () => {
  it('calls POST /platform/hotsite/unpublish', async () => {
    mock
      .onPost('/platform/hotsite/unpublish')
      .reply(200, { unpublishedAt: '2026-07-01T00:00:00Z' });
    const res = await unpublishHotsite();
    expect(res).toMatchObject({ unpublishedAt: '2026-07-01T00:00:00Z' });
  });
});

describe('generateHotsiteImageSignedUrl', () => {
  it('calls POST /platform/hotsite/images/signed-url', async () => {
    const response = {
      signedUrl: 'https://storage.example.com/upload',
      filePath: 'tenants/t-1/hotsite/logo.jpg',
      expiresAt: '',
    };
    mock.onPost('/platform/hotsite/images/signed-url').reply(201, response);
    const res = await generateHotsiteImageSignedUrl({
      fileName: 'logo.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.signedUrl).toContain('https://');
  });
});

describe('featureBookingPhoto', () => {
  it('calls POST /platform/hotsite/gallery/feature-booking-photo', async () => {
    mock.onPost('/platform/hotsite/gallery/feature-booking-photo').reply(200, { success: true });
    const res = await featureBookingPhoto({
      bookingId: 'b-1',
      photoType: 'after',
      filePath: 'tenants/t-1/bookings/b-1/photo.jpg',
    });
    expect(res).toMatchObject({ success: true });
  });
});
