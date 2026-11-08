// The staff booking detail page's action and sheet states. They live in model/ because the
// model helpers (booking-approve-action, booking-no-show-actions, booking-sheet-outcomes) and
// the detail components both read them, and model/ must not import from components/.

export type BookingNoShowActionState =
  | 'no-show'
  | 'no-show-terminal'
  | 'no-show-not-ended'
  | 'no-show-error'
  | 'corrected'
  | 'correct-error'
  | 'correct-forbidden';

export type BookingDetailActionState =
  | 'idle'
  | 'submitting'
  | 'approved'
  | 'rejected'
  | 'info-requested'
  | 'slot-conflict'
  | 'cancelled'
  | BookingNoShowActionState;

export type BookingDetailSheetState =
  'reject' | 'info' | 'cancel' | 'no-show' | 'correct-no-show' | null;
