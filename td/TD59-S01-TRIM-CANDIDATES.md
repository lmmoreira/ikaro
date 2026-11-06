# TD59-S01 — Trim candidates (appendix to `td/TD59-E2E-SUITE-DURATION.md`)

> **Status of this file: unverified agent output.** Five read-only reviews (2026-11-06) read the whole E2E suite and proposed what to remove, merge or move down. Nothing here was run. Every entry must be re-read, and every "covering spec" line re-opened, before it is acted on (the coverage-safety protocol in TD59 Story 1). Seconds are estimates from CI run 42220584040 and assume 1-1.5 s of setup saved per merged test. Baseline: commit `c42e5700cb`, 445 tests, 63 specs, 19.0 min of test time.

**Format:** `spec:line` is under `apps/web/e2e/`. Verdicts: **DUP** (asserts nothing the survivor does not), **DOWN** (a Vitest/jest spec already asserts it; the cited `file:line` is where), **MERGE→x** (append its assertions as `test.step`s of test `x`), **RULE** (an edge/error/viewport check that `docs/TESTING_STRATEGY.md` Layer 5 puts lower). `T1` = fits Tier 1 of Story 1; `F` = follow-up story (3+ test merge, needs new unit cases, or real-browser check); `KEEP` = leave untouched, with the reason.

## Checked while writing this file (2026-11-06)

| Claim | Result |
|---|---|
| Backend spec for `BOOKING_SLOT_CLOSED` | exists (`booking-hours.controller.integration.spec.ts` and others) |
| Backend spec for `SCHEDULED_IN_PAST` on recurring | exists (`recurring-booking-schedule.controller.integration.spec.ts`) |
| Backend spec for `PHONE_NOT_SET` | exists for booking-by-staff only; **none found for recurring-by-staff** |
| Backend spec for `LEG_UNAVAILABLE` | **none found** in backend or BFF |
| `STAFF_ALREADY_EXISTS`, `STAFF_SELF_DEACTIVATION` reaching the UI | only the domain-error spec found; **no HTTP-level proof confirmed** |
| Cap of 10 active alerts | **no backend spec found** |
| Renewal-reminder / loyalty-warning bounds | backend validator specs exist; the form-level bounds have no Vitest case |
| `vitest.config.ts` excludes `**/e2e/**` | confirmed (a helper spec cannot move to Vitest without a config change) |

Tests that depend on the **none found** rows stay untouched in Story 1: `basket:153` (real leg taken), `team-invite:62`, `team-deactivate:64`, `dash:324`, `aa:167`.

## Cluster 1 — Hotsite and settings (~68 tests, ~120 s)

| Test | Verdict | Target / covering | Tier |
|---|---|---|---|
| hotsite-editor:228 publish from visual editor | DUP of :1640 | | T1 |
| hotsite-editor:899 Manifesto backend rejects | DUP of :452 | | T1 |
| hotsite-editor:1336 organize modules | DUP of :239 + :1580 | VisualHotsiteEditorView.spec.tsx:490 | T1 |
| hotsite-editor:463 SEO title 60 chars | DOWN | SeoTab.spec.tsx:32-35 | T1 |
| hotsite-editor:880 malformed JSON | DOWN | ManifestTab.spec.tsx:55,65,170 | T1 |
| hotsite-editor:1687 Manifesto presentation | DOWN | ManifestTab.spec.tsx:42,110-132 | T1 |
| hotsite-editor:1206, :1224 cap banner | DOWN | ChatbotConfigPanel.spec.tsx:44-60 (both mock the route) | T1 |
| hotsite-editor:1296 invalid lead question | DOWN | HotsiteEditor.spec.tsx:1731-1760 | T1 |
| hotsite-editor:1413 far-down module Cancel/Discard | DOWN | HotsiteEditor.spec.tsx:537-565 | T1 |
| hotsite-editor:1441 publish blocked while unapplied | DOWN | VisualHotsiteEditorView.spec.tsx:340; HotsiteEditor.spec.tsx:545,560 | T1 |
| hotsite-editor:1498 colour survives contexts | DOWN | HotsiteEditor.spec.tsx:1120,1155 (add the rgb line to :1580) | T1 |
| hotsite-editor:1524 sharing simulations | DOWN | HotsiteSharingPreview.spec.tsx:77-82 | T1 |
| hotsite-editor:1728 visual refused publish | DOWN | VisualHotsiteEditorView.spec.tsx:372-380 | T1 |
| hotsite-editor:1762 refused share-image upload | DOWN | SingleImageUploadField.spec.tsx:287-291 | T1 |
| hotsite-editor:1563 dirty module blocks Branding/Sharing | no case for Branding/Sharing | needs a new Vitest case | F |
| hotsite-editor:117 → :212; :128 → :212; :201 → :155; :425 → :440; :1748 → :452 | MERGE (2-test) | HotsitePreviewCanvas.spec.tsx:495-515 for :128 | T1 |
| hotsite-editor:103 → :440; :305 → :239; :374 → :341; :396 → :341; :1640 → :212; :1248 → :1463 | MERGE | ModuleConfigShell.spec.tsx:70-95 for :396 | T1 if single absorber, else F |
| hotsite-editor:1663 mobile + tablet viewport | RULE (needs a real browser) | | F |
| hotsite-editor:584, :622, :922, :721, :1121, :1079 | long merges into :533/:665/:767/:974/:1016 | | F |
| hotsite-template-picker:181 | DOWN | HotsiteEditor.spec.tsx:1047-1065 | T1 |
| hotsite-template-picker:235 Undo | DOWN | useHotsiteTemplateApplication.spec.tsx:306-346; HotsiteTemplateGallery.spec.tsx:224-255 | T1 |
| hotsite-template-picker:292, :320 failing catalogue / apply | DOWN | HotsiteTemplateGallery.spec.tsx:167-190,385-392; useHotsiteTemplateApplication.spec.tsx:96,262-295 | T1 |
| hotsite-template-picker:259 NAVIGATION link | DOWN, partial | LayoutTab.spec.tsx:89-135; the inspector add-item step has no cover | F |
| hotsite-template-picker:145, :163 → :73 | MERGE | hotsite-templates-api.spec.ts:102 for the backend side | F |
| hotsite-templates:203 (x2), :243 → the composition test :123 | MERGE | the six compositions stay (only proof the backend accepts each) | T1 |
| hotsite-templates-api:125, :148 | DOWN | apply-hotsite-template.use-case.integration.spec.ts:172-186; use-case.spec.ts:143 | T1 |
| hotsite-auth-bar:33, :43 → :15; :109, :137 → :119 | MERGE | | T1 |
| hotsite-auth-bar:51, :64, :77, :158 → :92 | 4-test merge, order-sensitive (cross-tenant check before the customer row exists) | HotsiteAuthBarDropdown.spec.tsx:49 for :64 | F |
| hotsite-login:25 → :4; not-found:25 → :8 | MERGE | | T1 |
| chatbot-widget:62 | DUP of :81 | | T1 |
| settings:32, :61, :209 → :45 | MERGE | SettingsForm.spec.tsx:92 for :32 | T1 |
| settings:99 failed save | DOWN | SettingsForm.spec.tsx:301-330 ("field value kept" not asserted there) | T1 after adding the assertion |
| settings:141 CEP not found | DOWN | SettingsForm.spec.tsx:450-460,344; SettingsFormAdvancedFields.spec.tsx:52 | T1 |
| settings:177 partial address | DOWN | SettingsForm.spec.tsx:368-385 | T1 |
| settings:188 Monday copy | DOWN | SettingsForm.spec.tsx:166-179; SettingsHoursSection.spec.tsx:46 | T1 |
| settings:79 (bound 31), :162 (loyalty warning) | RULE, **no covering Vitest case** | add cases next to SettingsForm.spec.tsx:182, else KEEP | F |
| settings:128 real ViaCEP lookup | KEEP (only real lookup; flakiness risk noted) | | KEEP |
| localization (2) | KEEP (per-tenant locale wiring has no lower equivalent) | | KEEP |

## Cluster 2 — Recurring schedules and alerts (37 tests, ~90 s)

| Test | Verdict | Target / covering | Tier |
|---|---|---|---|
| dash:36 chooser disables new contact | DOWN | CustomerChooserStep.spec.tsx:169-175 | T1 |
| dash:349 past start / today | DOWN (RULE) | NewRecurringScheduleForStaff.spec.tsx:132,481; recurring-staff-create.spec.ts:49-63,178; backend integration spec exists. The 23:30 step is non-deterministic | T1 |
| dash:324 PHONE_NOT_SET | DOWN in UI only | no backend spec for recurring-by-staff | KEEP |
| dash:87, :108, :199, :294, :393 → :52; :231 second half → DUP of bundle:109 | long merges | | F |
| create:65 | DUP of bundle:152 + staff-recurring-approval:28 | | T1 |
| create:174 → :28 | MERGE | CustomerTopbar.spec.tsx:59-62; RecurringScheduleList.spec.tsx:151 | T1 |
| create:138 → :94 | MERGE, order-sensitive | | F |
| create:211 phone viewport | RULE (CSS) | NewReservationMenu.spec.tsx:36; BookingsList.spec.tsx:108-112 | F |
| bundle:195 | DUP of bundle:44 + default-service:31 + bundle:239 | | T1 |
| bundle:79 → :44 | MERGE | NewRecurringScheduleReview.spec.tsx:67-78 (renders pre-built rows only) | T1 |
| default:63 → bundle:239 | MERGE | recurring-service-eligibility.spec.ts:86-93,145 | T1 |
| default:86 phone viewport | RULE (CSS), also drops a one-off booking creation | | F |
| renew:60, :88 → :28; :111 optional | MERGE | NewRecurringSchedulePage.spec.tsx:444-446 (render only; the 404 handling is E2E-only) | T1 for :60, :88 |
| sched:45, :78, :121, :138 → :18 | 4-test merge | OccurrencePager.spec.tsx:37 for the `pager-previous` assertion | F |
| appr:182 → :28; :92 → :120; :153 → :62 | MERGE | no unit spec covers `recurring-settled-note` | T1 |
| alerts:48, :74 → :18 | MERGE | AvailabilityAlertList.spec.tsx:143 | T1 (confirm `alerts-entry-row` visibility rule first) |
| aa:72 → :33 | MERGE | | T1 |
| aa:196, :230, :259 → :33 | 3-test merge; persisted-payload checks stay | NewAvailabilityAlertForm.spec.tsx:154,219; availability-alert-link.spec.ts:141 | F |
| aa:290 basket of two | DOWN | BookingForm.alert.spec.tsx:109-119; availability-alert-link.spec.ts:54 | T1 |
| aa:167 cap view | UI covered (NewAvailabilityAlertForm.spec.tsx:443-446; AvailabilityAlertOutcomeViews.spec.tsx:104-118), **no backend cap spec** | | KEEP |
| email:51 unhonourable links | DOWN | booking-deep-link.spec.ts:50,54; availability-alert-link.spec.ts:249 | T1 |
| email:73 → :27 | MERGE (no unit spec asserts `slot-picker-empty`) | | T1 |

## Cluster 3 — Booking flows (~25 tests, ~83 s)

| Test | Verdict | Target / covering | Tier |
|---|---|---|---|
| basket:264 real leg taken | DOWN in UI only (**no backend spec**; the real race is basket:153) | BookingForm.m23.spec.tsx:472-492 | KEEP |
| basket:318, :597 → :211 | MERGE (axe; :597 loses review-in-dark) | | T1 for :318; F for :597 |
| basket:629 → :400 | MERGE with a mid-flow viewport change | | F |
| auto-journey:264 mocked LEG_UNAVAILABLE | DUP of basket:264 / BookingForm.m23.spec.tsx:472 | | T1 |
| var-duration:123 | DUP of :61 and :155 | | T1 |
| var-duration:210 | DOWN | VariableDurationStep.spec.tsx:116-131 | T1 |
| var-duration:237 | DOWN, wiring through BookingForm unspecced | booking-steps.spec.ts:204,294; VariableDurationStep.spec.tsx:134 | F |
| var-duration:279 → :61 | MERGE (axe) | | T1 |
| intake:172 | DOWN | BookingForm.m23.spec.tsx:546-561; booking-steps.spec.ts:210 | T1 |
| intake:218 | DOWN, real backend rejection not covered afterwards | booking-steps.spec.ts:209; ServiceSelectionStep.spec.tsx:363 | F |
| intake:255 → :80 | MERGE (axe) | | T1 |
| submit-routing:88 closure mid-flow | DOWN (backend closure spec exists; slot-conflict :60 stays as full-stack proof) | BookingForm.spec.tsx:477-500 | T1 after reading the backend spec |
| submit-routing:117, :174, :207 | DOWN | booking-steps.spec.ts:209-210; ServiceSelectionStep.spec.tsx:363,226-227,249; BookingSubmittedDetails.spec.tsx:78-90 (the "Voltar para o site" link has no spec) | T1 except :207 link assertion |
| submit-routing:145 mocked 401 to login | DOWN, the only visit to the hotsite login route in this cluster | BookingForm.m23.spec.tsx:565-585 | F (route check first) |
| submit-routing:233 → chosen:44 | MERGE (axe) | | T1 |
| chosen:124 → :102 | MERGE | | T1 |
| chosen:244 | DOWN | ResourcePicker.spec.tsx:55 | T1 |
| chosen:262 | DUP of basket:153 | | T1 |
| guest-booking:43, :54, :62, :84, :101, :124 | DOWN | PersonalInfoStep.spec.tsx:129; ServiceSelectionStep.spec.tsx:157,413; AvailabilityCarousel.spec.tsx:207; BookingForm.spec.tsx:588-597,504-518 | T1 |
| guest-booking:163, :177, :185 → :7 | MERGE (3 into the golden path) | | F |
| authenticated:136 | DOWN | BookingForm.spec.tsx:430 | T1 |
| authenticated:116 default pickup | DOWN, the only real profile-fetch prefill; its 11 s is first-hit compile cost | BookingForm.spec.tsx:396 | KEEP |
| guest-submit-info:12 | DUP of :31 | | T1 |
| guest-submit-info:106 → :112 | MERGE | | T1 |
| info-prompt:11 → :65 | MERGE | | T1 |
| info-prompt:25, :45 | DOWN | InformationCompletionPrompt.spec.tsx:179-197,227-241 | T1 |
| staff-new:40 → :50 | MERGE (confirm `startNewBooking` drives the menu) | | T1 |
| staff-new:95 | DOWN | NewBookingForStaffPage.spec.tsx:199; NewBookingResourcePickerStep.spec.tsx:63 | T1 |
| staff-new:72, :203 → :50 | MERGE, slot/customer collision risk | | F |
| helpers/booking/slot-seed.spec.ts (12) | move to Vitest | needs a vitest config change | out of scope |

## Cluster 4 — Schedule and bookings (50 tests, ~75-84 s)

| Test | Verdict | Target / covering | Tier |
|---|---|---|---|
| schedule:83 → :57; :611 → :57; :684 → :57 | MERGE (3 into :57) | no unit spec for `schedule-week-day-badge` | F |
| schedule:185 → :94; :374 → :325; :504 → :533 | MERGE | ClosureFormSheet.spec.tsx:233-279 covers only the positive case | T1 for :185, :374; F for :504 |
| schedule:256, :298 → :217 | MERGE | | T1 |
| schedule:572 | DOWN | ScheduleTimelineEventRenderer.spec.tsx:518 | T1 |
| schedule:659 | DOWN | ScheduleMainView.spec.tsx:97-105; ScheduleTimelineBoard.spec.tsx:125-129 | T1 |
| schedule:126 failed removal | RULE, partial cover | schedule.server.spec.ts:43-52 (no render assertion) | KEEP |
| resource-columns:250 7th resource | DOWN | ResourceFilterMenu.spec.tsx:151-183 | T1 |
| resource-columns:287 shared ruler | DOWN, but the covering spec mocks the grid so the real BFF ruler loses its only end-to-end check | ScheduleResourceColumnsBoard.spec.tsx:169-215 | KEEP |
| resource-columns:590 STAFF-first "+2" | DOWN | schedule-resource-priority.spec.ts:21-40; schedule-timeline-events.spec.ts:96; BookingResourceSummaryLine.spec.tsx:22-27 | T1 |
| resource-columns:193 → :47; :529 → :465; :665 → :390; :874 → :815 | MERGE | | T1 |
| scheduling-exceptions:291 | DOWN | SchedulingExceptionWorklistPage.spec.tsx:99-107 | T1 |
| scheduling-exceptions:169 → :218; :278 → :436 | MERGE | | T1 |
| scheduling-exceptions:190 → :319; :463 → :218 | long, order-fragile chains (`booking-decision-*` testids have no Vitest) | | F |
| floating-filter-drag:63 → :39; :77 → :39; :96 → :39; :130 → :106; :143 → :39 | MERGE (5), geometry checks stay in E2E | FloatingFilterDock.spec.tsx:97,132; floating-filter-preferences.spec.tsx:73; model/floating-filter-corner.spec.ts:59-70 | T1 for :63, :130; F for the rest |
| staff-no-show:70 | DOWN | BookingActionPanel.spec.tsx:124-135,173-195 (desktop hint text not verified) | T1 |
| staff-no-show:118 → :33; :245, :291 → :260 | MERGE | BookingDetailPage.spec.tsx:677; BookingActionPanel.spec.tsx:154-168 | T1 |
| staff-no-show:141, :161, :190 → :216 | MERGE (3) | BookingDetailPage.spec.tsx:742,756-758 | F |
| lifecycle:9 → :26; :101 → :122; :221 → :194; :49 → :74 | MERGE; :49 and :221 lose failure isolation | | T1 for :9, :101; F for :49, :221 |
| booking-detail:30 → lifecycle:194; :166 → :44 | MERGE; :30 would assert on a rescheduled booking | StaffBookingExtras.spec.tsx; BookingDetailMain.spec.tsx:120-127 | F |
| booking-detail:210 | DUP of lifecycle:122 (add `complete-summary-quoted`) | | T1 |
| booking-window:51 → :42 | MERGE (day-strip semantic not verified) | | F |
| appointment-end:121 → reschedule:63 | MERGE | | T1 |
| my-account-bookings:9 → :30; :73 → reschedule:191 | MERGE | no unit spec for `booking-window-closed-note` | T1 for :9; F for :73 |
| my-account-bookings:60 empty state | DOWN | BookingsList.spec.tsx:157; HomeDashboard.spec.tsx:97 | T1 |
| detail-cancel:43 → :15; :66 → reschedule:191; :90 → :144 | MERGE | CancelConfirmPage.spec.tsx:157 for :90 | T1 for :43, :90; F for :66 |
| reschedule:216 → :191 | MERGE | | F (pending-booking fixture not confirmed) |

## Cluster 5 — Services, team, leads and the rest (49 tests, ~65 s)

| Test | Verdict | Target / covering | Tier |
|---|---|---|---|
| services-resource-config:162 | DUP of :395 | | T1 |
| services-resource-config:366 | DUP of :570 | ServiceEditPage.spec.tsx:354,487,498 | T1 |
| services-resource-config:383 | DOWN | ServiceEditPage.spec.tsx:652 | T1 |
| services-resource-config:42 → :181; :244 → :270; :303 → :270; :321 → :395; :465 → :520 | MERGE | ServiceResourceTypeFields.spec.tsx:276-308 for :465 (the API-422 line stays) | T1 for :42, :244; F for the rest |
| services-resource-config:606 mobile bar | RULE (CSS overflow, no cover) | | KEEP |
| services-resource-config:570 | KEEP, trim the 'nothing dirty' phase | ServiceEditPage.spec.tsx:511-546 | T1 |
| services-create:102 | DOWN | ServiceCreatePage.spec.tsx:70,219 | T1 |
| services-create:120 boundary values | RULE, no covering spec read | | KEEP |
| services-create:147 mobile bar | RULE (viewport) | | F |
| services-create:155 → :73 | MERGE | ServiceCreatePage.spec.tsx:116 | T1 |
| services-manage:43 → :71; services-list:10 → services-manage:71 | MERGE | ServiceListPage.spec.tsx:116 | T1 |
| services-manage:101 not found | RULE, asserts a translated string | | convert, KEEP |
| service-public-page:155 → :104; :240 → :36 | MERGE (axe contrast stays E2E: jsdom disables colour-contrast) | ServiceDetailPage.spec.tsx:226 | T1 |
| resources-manage:59 → :7 | MERGE | | T1 |
| resources-manage:85 | DOWN, but the seeded "Localização Principal" backfill row is only checked here | ResourceRow.spec.tsx:53 etc. | KEEP |
| resources-manage:110 STAFF redirect | DOWN for the redirect (proxy.spec.ts:139-147); sidebar hiding not confirmed | | KEEP until Sidebar.spec.tsx is read |
| team-invite:34, :50, :95 → :17 | MERGE (:95 asserts a translated link name) | | T1 |
| team-invite:62 duplicate email | **no HTTP-level proof** | InviteForm.spec.tsx:118-137 | KEEP |
| team-invite:78, :102 | DOWN | InviteForm.spec.tsx:71-81,60 | T1 |
| team-manage:40, :74, :83 | DOWN | StaffDetailPage.spec.tsx:80-89,59-64,178 | T1 |
| team-deactivate:40 → :17 | MERGE | | T1 |
| team-deactivate:64 self-deactivation | **no HTTP-level proof** | DeactivateConfirmPage.spec.tsx:63-72 | KEEP |
| leads-search:195 | DOWN | LeadFormSearchPanel.spec.tsx:59-76 | T1 |
| leads-search:233 | DUP of :251 | LeadFormSearchPanel.spec.tsx:117-143 | T1 |
| leads-search:214 → :284; :296 → :181 | MERGE | LeadFormSubmissionsList.spec.tsx:263,319 | T1 |
| leads-search:319 hand-edited URL | RULE, no covering spec | extract a helper + unit test | F |
| guest-lead-form:148 → :92 | MERGE; keep the soft-nav entry path (CSP regression guard) | | F |
| guest-lead-form:169 | DOWN, "data preserved" not confirmed | LeadFormWidget.spec.tsx:164,236 | F |
| my-account-loyalty:25 → :11 | MERGE | | T1 |
| my-account-loyalty:40, :62 | RULE (viewport / pure render) | CustomerBottomNav.spec.tsx:17,49-55; CustomerTabNav.spec.tsx:17 | T1 for :62; F for :40 |
| home-widgets:59, :90 → :26 | MERGE | HomeRenewalCard.spec.tsx:83 | T1 for :59; F for :90 |
| home-widgets:114 | DOWN | HomeDashboard.spec.tsx:236,249-261 | T1 |
| switch-tenant:11, :53, :65 → :86 | 3-test merge, order-sensitive | | F |
| select-staff-tenant:20 | DOWN | SelectStaffTenantClient.spec.tsx:102-116 | T1 |

## Not counted anywhere above

Translated-string assertions in tests that Story 1 does not touch (staff-login heading, resources/team link names, `'Tenant não encontrado'`, reschedule:90 and :139, staff-no-show:90) are a rule violation but a separate, small cleanup.
