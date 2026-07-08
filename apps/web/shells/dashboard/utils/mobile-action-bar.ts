// Shared bottom offset for any page-level fixed mobile action bar that must clear the dashboard's
// own fixed BottomNav (components/BottomNav.tsx) instead of overlapping it. Used by every
// top-level page that renders its own mobile action bar alongside BottomNav (hotsite editor,
// hotsite preview, module config, settings) — a single shared constant so a future BottomNav
// height/padding change only needs one edit instead of updating every call site in lockstep.
export const MOBILE_ACTION_BAR_CLEARANCE_CLASS =
  'bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]';
