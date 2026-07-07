'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GalleryImage } from '@ikaro/types';
import { getBooking, listBookings } from '@/features/booking/api/staff';
import { featureBookingPhoto } from '@/features/platform/tenant-settings';

interface BookingPhotoPickerProps {
  readonly onPick: (image: GalleryImage, previewUrl: string) => void;
  readonly onClose: () => void;
}

interface BookingCandidate {
  readonly bookingId: string;
  readonly contactName: string;
  readonly scheduledAt: string;
}

interface BookingPhotos {
  readonly bookingId: string;
  readonly beforeUrls: readonly string[];
  readonly beforePaths: readonly string[];
  readonly afterUrls: readonly string[];
  readonly afterPaths: readonly string[];
}

// Inline expandable panel (not a modal — no Dialog primitive exists in this codebase yet, and
// the rest of the Layout tab already establishes an inline-expansion pattern over modals for
// "Configurar"). Browses COMPLETED bookings via the existing staff booking-list/detail
// endpoints (no new backend reads needed), then features a chosen photo via the existing
// POST /tenants/hotsite/gallery/feature-booking-photo endpoint.
export function BookingPhotoPicker({
  onPick,
  onClose,
}: BookingPhotoPickerProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.gallery.picker');
  const [candidates, setCandidates] = useState<readonly BookingCandidate[] | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<BookingPhotos | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBookings({ status: 'COMPLETED', limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setCandidates(
          res.items.map((b) => ({
            bookingId: b.bookingId,
            contactName: b.contactName,
            scheduledAt: b.scheduledAt,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // No reset to null when deselecting — the render guard below (`photos?.bookingId ===
    // selectedBookingId`) already hides stale photos once selectedBookingId changes or is
    // cleared, without a synchronous setState in the effect body
    // (react-hooks/set-state-in-effect). Tagging the result with its own bookingId is what
    // prevents a stale flash when switching directly from one booking to another.
    if (!selectedBookingId) return;
    let cancelled = false;
    getBooking(selectedBookingId)
      .then((detail) => {
        if (cancelled) return;
        setPhotos({
          bookingId: selectedBookingId,
          beforeUrls: detail.beforeServicePhotoUrls,
          beforePaths: detail.beforeServicePhotoPaths,
          afterUrls: detail.afterServicePhotoUrls,
          afterPaths: detail.afterServicePhotoPaths,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPhotos({
            bookingId: selectedBookingId,
            beforeUrls: [],
            beforePaths: [],
            afterUrls: [],
            afterPaths: [],
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBookingId]);

  const currentPhotos = photos?.bookingId === selectedBookingId ? photos : null;

  async function handlePick(photoType: 'before' | 'after', index: number): Promise<void> {
    if (!selectedBookingId || !currentPhotos) return;
    const filePath =
      photoType === 'before' ? currentPhotos.beforePaths[index] : currentPhotos.afterPaths[index];
    if (!filePath) return;

    setPicking(true);
    try {
      const result = await featureBookingPhoto({
        bookingId: selectedBookingId,
        photoType,
        filePath,
      });
      onPick(
        {
          url: result.filePath,
          source: 'booking',
          bookingId: selectedBookingId,
          photoType: result.photoType,
        },
        result.url,
      );
    } finally {
      setPicking(false);
    }
  }

  const hasPhotos =
    currentPhotos && (currentPhotos.beforeUrls.length > 0 || currentPhotos.afterUrls.length > 0);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{t('title')}</h4>
        <button
          type="button"
          data-testid="booking-photo-picker-close"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t('closeLabel')}
        </button>
      </div>

      {candidates === null && <p className="text-sm text-gray-500">{t('loadingLabel')}</p>}

      {candidates !== null && candidates.length === 0 && (
        <p className="text-sm text-gray-500">{t('emptyLabel')}</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="mb-3">
          <label htmlFor="booking-photo-picker-select" className="mb-1 block text-xs text-gray-600">
            {t('selectBookingLabel')}
          </label>
          <select
            id="booking-photo-picker-select"
            data-testid="booking-photo-picker-select"
            value={selectedBookingId ?? ''}
            onChange={(event) => setSelectedBookingId(event.target.value || null)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {candidates.map((c) => (
              <option key={c.bookingId} value={c.bookingId}>
                {c.contactName} — {new Date(c.scheduledAt).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedBookingId && currentPhotos && !hasPhotos && (
        <p className="text-sm text-gray-500">{t('noPhotosLabel')}</p>
      )}

      {selectedBookingId && currentPhotos && hasPhotos && (
        <div className="grid grid-cols-4 gap-2" data-testid="booking-photo-picker-grid">
          {currentPhotos.beforeUrls.map((url, index) => (
            <button
              key={`before-${index}`}
              type="button"
              disabled={picking}
              onClick={() => {
                void handlePick('before', index);
              }}
              className="group relative overflow-hidden rounded-md border border-gray-200"
            >
              <img src={url} alt="" className="h-20 w-full object-cover" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-[10px] text-white">
                {t('beforeLabel')}
              </span>
            </button>
          ))}
          {currentPhotos.afterUrls.map((url, index) => (
            <button
              key={`after-${index}`}
              type="button"
              disabled={picking}
              onClick={() => {
                void handlePick('after', index);
              }}
              className="group relative overflow-hidden rounded-md border border-gray-200"
            >
              <img src={url} alt="" className="h-20 w-full object-cover" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-[10px] text-white">
                {t('afterLabel')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
