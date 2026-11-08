// The status of a booking submission, read by the submission hooks and by the confirmation views
// of both flows. It lives in model/ because the hooks must not import from components/.
export type BookingSubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';
