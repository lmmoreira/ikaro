'use client';

interface BookingPhotoThumbnailGroupProps {
  readonly urls: readonly string[];
  readonly label: string;
  readonly picking: boolean;
  readonly photoDimensions: ReadonlyMap<string, { width: number; height: number }>;
  readonly onPick: (index: number) => void;
  readonly onThumbnailLoad: (url: string, event: React.SyntheticEvent<HTMLImageElement>) => void;
}

// Renders one before/after thumbnail group for BookingPhotoPicker. Extracted because the two
// groups were identical JSX apart from which urls/label/handler they were given — this replaces
// that duplication with a single parameterized component instead of shortening either call site.
export function BookingPhotoThumbnailGroup({
  urls,
  label,
  picking,
  photoDimensions,
  onPick,
  onThumbnailLoad,
}: BookingPhotoThumbnailGroupProps): React.JSX.Element {
  return (
    <>
      {urls.map((url, index) => (
        <button
          key={url}
          type="button"
          disabled={picking || !photoDimensions.has(url)}
          onClick={() => onPick(index)}
          className="group relative overflow-hidden rounded-md border border-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed booking-photo URLs are rendered as native thumbnails */}
          <img
            src={url}
            alt=""
            onLoad={(event) => onThumbnailLoad(url, event)}
            className="aspect-square w-full object-cover"
          />
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 text-[10px] text-white">
            {label}
          </span>
        </button>
      ))}
    </>
  );
}
