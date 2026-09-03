import { useTranslations } from 'next-intl';
import { matchBookingDetailRoute } from './booking-route';
import { isResourceCreateRoute, matchResourceRoute } from './resource-route';
import { isServiceCreateRoute, matchServiceRoute } from './service-route';
import { isTeamInviteRoute, matchTeamRoute } from './team-route';

// Split out of Topbar.tsx to keep it under the file-length cap — pure pathname-to-title/back-link
// resolution, no JSX or component state, so it belongs alongside this shell's other
// route-matching model files rather than in the component file itself.

export const PAGE_TITLE_KEYS: ReadonlyArray<[string, string]> = [
  ['/dashboard/bookings', 'nav.bookings'],
  ['/dashboard/schedule', 'nav.schedule'],
  ['/dashboard/services', 'nav.services'],
  ['/dashboard/loyalty', 'nav.loyalty'],
  ['/dashboard/leads', 'nav.leads'],
  ['/dashboard/team', 'nav.team'],
  ['/dashboard/settings', 'nav.settings'],
  ['/dashboard/hotsite', 'nav.hotsite'],
  ['/dashboard/resources', 'nav.resources'],
];

export interface TopbarRouteState {
  readonly pageTitle: string;
  readonly backHref: string | null;
  readonly backLabel: string;
  readonly isBookingRoute: boolean;
  readonly isServicesCreateRoute: boolean;
  readonly isTeamInviteRoute: boolean;
}

interface TopbarRouteContext {
  readonly pathname: string;
  readonly commonBackLabel: string;
  readonly dashboardT: ReturnType<typeof useTranslations>;
  readonly servicesT: ReturnType<typeof useTranslations>;
  readonly teamT: ReturnType<typeof useTranslations>;
  readonly bookingT: ReturnType<typeof useTranslations>;
  readonly resourcesT: ReturnType<typeof useTranslations>;
  readonly returnTo: string | null;
}

interface TitleAndBackLink {
  readonly pageTitle: string;
  readonly backHref: string | null;
  readonly backLabel: string;
}

function resolveBookingSheetTitle(
  action: NonNullable<ReturnType<typeof matchBookingDetailRoute>>['action'],
  bookingT: TopbarRouteContext['bookingT'],
): string {
  if (action === 'complete') return bookingT('completeSheetTitle');
  if (action === 'reschedule') return bookingT('rescheduleSheetTitle');
  return bookingT('title');
}

function resolveBookingTitleAndBackLink(
  ctx: TopbarRouteContext,
  bookingRouteMatch: NonNullable<ReturnType<typeof matchBookingDetailRoute>>,
): TitleAndBackLink {
  const { commonBackLabel, bookingT, returnTo } = ctx;
  const pageTitle = resolveBookingSheetTitle(bookingRouteMatch.action, bookingT);
  const backHref =
    returnTo ??
    (bookingRouteMatch.action === null
      ? '/dashboard/bookings'
      : `/dashboard/bookings/${bookingRouteMatch.bookingId}`);
  return { pageTitle, backHref, backLabel: commonBackLabel };
}

function resolveServiceTitleAndBackLink(ctx: TopbarRouteContext): TitleAndBackLink | null {
  const { pathname, commonBackLabel, servicesT } = ctx;
  const serviceRouteMatch = matchServiceRoute(pathname);

  if (serviceRouteMatch?.action === 'edit') {
    return {
      pageTitle: servicesT('editPageTitle'),
      backHref: '/dashboard/services',
      backLabel: ctx.dashboardT('nav.services'),
    };
  }
  if (serviceRouteMatch?.action === 'deactivate') {
    return {
      pageTitle: servicesT('deactivatePageTitle'),
      backHref: `/dashboard/services/${serviceRouteMatch.serviceId}/edit`,
      backLabel: servicesT('editPageTitle'),
    };
  }
  if (isServiceCreateRoute(pathname)) {
    return {
      pageTitle: servicesT('createPageTitle'),
      backHref: '/dashboard/services',
      backLabel: commonBackLabel,
    };
  }
  return null;
}

function resolveTeamTitleAndBackLink(ctx: TopbarRouteContext): TitleAndBackLink | null {
  const { pathname, dashboardT, teamT } = ctx;
  const teamRouteMatch = matchTeamRoute(pathname);

  if (isTeamInviteRoute(pathname)) {
    return {
      pageTitle: teamT('invite'),
      backHref: '/dashboard/team',
      backLabel: dashboardT('nav.team'),
    };
  }
  if (teamRouteMatch?.action === 'deactivate') {
    return {
      pageTitle: teamT('deactivateMemberPageTitle'),
      backHref: '/dashboard/team',
      backLabel: dashboardT('nav.team'),
    };
  }
  return null;
}

// Unlike services (edit lives at /:id/edit, its own dedicated title), a resource's edit route
// is the bare /:id — ResourceEditForm.tsx already overrides the topbar title with the loaded
// resource's own name once it arrives (setPageTitleOverride), same pattern as
// StaffDetailPage/BookingDetailPage. This resolver's editPageTitle only covers the brief window
// before that override lands (was falling back all the way to the generic default title before
// this — M21-S04 live review, 2026-09-02).
function resolveResourceTitleAndBackLink(ctx: TopbarRouteContext): TitleAndBackLink | null {
  const { pathname, dashboardT, resourcesT } = ctx;

  if (isResourceCreateRoute(pathname)) {
    return {
      pageTitle: resourcesT('createPageTitle'),
      backHref: '/dashboard/resources',
      backLabel: ctx.commonBackLabel,
    };
  }

  const resourceRouteMatch = matchResourceRoute(pathname);
  if (resourceRouteMatch?.action === 'edit') {
    return {
      pageTitle: resourcesT('editPageTitle'),
      backHref: '/dashboard/resources',
      backLabel: dashboardT('nav.resources'),
    };
  }
  if (resourceRouteMatch?.action === 'deactivate') {
    return {
      pageTitle: resourcesT('deactivatePageTitle'),
      backHref: '/dashboard/resources',
      backLabel: dashboardT('nav.resources'),
    };
  }
  return null;
}

function resolveSectionTitleAndBackLink(ctx: TopbarRouteContext): TitleAndBackLink | null {
  return (
    resolveServiceTitleAndBackLink(ctx) ??
    resolveTeamTitleAndBackLink(ctx) ??
    resolveResourceTitleAndBackLink(ctx)
  );
}

function resolveTitleAndBackLink(ctx: TopbarRouteContext): TitleAndBackLink {
  const { pathname, commonBackLabel, dashboardT } = ctx;
  const bookingRouteMatch = matchBookingDetailRoute(pathname);
  if (bookingRouteMatch) return resolveBookingTitleAndBackLink(ctx, bookingRouteMatch);

  const sectionResult = resolveSectionTitleAndBackLink(ctx);
  if (sectionResult) return sectionResult;

  const pageTitleKey = PAGE_TITLE_KEYS.find(([path]) => pathname.startsWith(path))?.[1];
  return {
    pageTitle: pageTitleKey ? dashboardT(pageTitleKey) : dashboardT('topbar.defaultTitle'),
    backHref: null,
    backLabel: commonBackLabel,
  };
}

export function resolveTopbarRouteState(ctx: TopbarRouteContext): TopbarRouteState {
  const { pathname, returnTo } = ctx;
  const { pageTitle, backHref, backLabel } = resolveTitleAndBackLink(ctx);

  return {
    pageTitle,
    backHref: backHref ?? returnTo,
    backLabel,
    isBookingRoute: matchBookingDetailRoute(pathname) !== null,
    isServicesCreateRoute: isServiceCreateRoute(pathname),
    isTeamInviteRoute: isTeamInviteRoute(pathname),
  };
}
