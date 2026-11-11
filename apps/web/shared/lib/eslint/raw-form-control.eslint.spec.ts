import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the real flat config rather than copying its selectors, like restricted-syntax.eslint.spec.ts.
// An `import` of the CommonJS config is not an option: the type-check would then follow it into
// packages/config/eslint-base.js and fail on that untyped file (TS7006, TS2322), so `require` it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

const DASHBOARD_PATH = 'features/booking/components/dashboard/example.tsx';
const ACCOUNT_PATH = 'features/customer/components/my-account/example.tsx';

describe('raw form control ban (TD58-S10)', () => {
  const eslint = new Linter({ configType: 'flat' });

  function lint(source: string, filePath: string) {
    return eslint.verify(source, productionConfig, filePath);
  }

  // Only the TD58 selectors: the fixtures are not full components, so unrelated rules stay out.
  function rawControlMessages(source: string, filePath: string) {
    return lint(source, filePath).filter(
      (message) => message.ruleId === 'no-restricted-syntax' && message.message.includes('TD58'),
    );
  }

  function component(body: string): string {
    return `export function Example(): React.JSX.Element { return (${body}); }`;
  }

  describe('flags a raw control in unbranded code', () => {
    it.each([
      ['<input>', '<input type="text" />', 'ui/input'],
      ['<textarea>', '<textarea />', 'ui/textarea'],
      ['<select>', '<select />', 'ui/native-select'],
      ['<label htmlFor>', '<label htmlFor="x">Name</label>', 'ui/label'],
    ])('%s names its primitive', (_name, jsx, primitive) => {
      for (const path of [DASHBOARD_PATH, ACCOUNT_PATH]) {
        const messages = rawControlMessages(component(jsx), path);

        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain(primitive);
      }
    });

    it('flags a folder the rule has never heard of (it fails closed)', () => {
      const messages = rawControlMessages(
        component('<input />'),
        'features/staff/components/brand-new-folder/example.tsx',
      );

      expect(messages).toHaveLength(1);
    });

    it('flags type="file": ui/file-input and ui/file-dropzone cover it', () => {
      expect(rawControlMessages(component('<input type="file" />'), DASHBOARD_PATH)).toHaveLength(
        1,
      );
    });

    it('flags an input whose type is only sometimes hidden', () => {
      const messages = rawControlMessages(
        component("<input type={flag ? 'hidden' : 'text'} />"),
        DASHBOARD_PATH,
      );

      expect(messages).toHaveLength(1);
    });
  });

  describe('allows', () => {
    it.each([
      ['type="hidden"', '<input type="hidden" name="x" />'],
      ["type={'hidden'}", '<input type={\'hidden\'} name="x" />'],
      ['type={`hidden`}', '<input type={`hidden`} name="x" />'],
    ])('an input with %s', (_name, jsx) => {
      expect(rawControlMessages(component(jsx), DASHBOARD_PATH)).toEqual([]);
    });

    it('a label that wraps its control and carries no htmlFor', () => {
      const jsx = '<label className="block"><span>Name</span><Textarea /></label>';

      expect(rawControlMessages(component(jsx), DASHBOARD_PATH)).toEqual([]);
    });

    it('the shared primitives', () => {
      expect(rawControlMessages(component('<input />'), 'shared/components/ui/input.tsx')).toEqual(
        [],
      );
    });

    it.each([
      'features/platform/components/public/ContactField.tsx',
      'shells/hotsite/components/ChatbotPanel.tsx',
      'shared/components/hotsite/branded-input.tsx',
      'features/booking/components/public/PhotoUpload.tsx',
    ])('the exact-path branded file %s keeps a native control', (path) => {
      const jsx = '<label htmlFor="x"><input /><textarea /><select /></label>';

      expect(rawControlMessages(component(jsx), path)).toEqual([]);
    });

    it('a spec file', () => {
      expect(
        rawControlMessages(
          component('<input />'),
          'features/booking/components/dashboard/x.spec.tsx',
        ),
      ).toEqual([]);
    });
  });

  describe('keeps every other ban on the exempt files', () => {
    // The exemption block replaces, not merges, the selector list: a restated list that dropped a
    // ban would silently lift it for the branded trees.
    it('still bans raw fetch() in a branded tree', () => {
      const messages = lint(
        "export async function load() { return fetch('https://example.com'); }",
        'features/booking/components/public/example.tsx',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('sanctioned BFF transport helpers'),
          }),
        ]),
      );
    });

    it('still bans a hand-written role="alert" in a branded tree', () => {
      const messages = lint(
        component('<div role="alert">oops</div>'),
        'features/platform/components/public/example.tsx',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('FeedbackMessage'),
          }),
        ]),
      );
    });

    it('keeps a reviewed raw-fetch exception that sits in a branded tree exempt from the fetch ban and the tree lifts', () => {
      const source = `export async function load() { await fetch('/x'); return (<button type="button">x</button>); }`;
      const messages = lint(source, 'shells/hotsite/components/HotsiteAuthBar.tsx').filter(
        (message) => message.ruleId === 'no-restricted-syntax',
      );

      expect(messages).toEqual([]);
    });

    it('still bans a raw text input in that same reviewed file', () => {
      const messages = lint(component('<input />'), 'shells/hotsite/components/HotsiteAuthBar.tsx');

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('BrandedInput') }),
        ]),
      );
    });

    it('still lets the two feedback components write the role', () => {
      for (const path of [
        'shared/components/ui/feedback-message.tsx',
        'shared/components/hotsite/branded-feedback-message.tsx',
      ]) {
        const messages = lint(component('<div role="alert">oops</div>'), path).filter(
          (message) => message.ruleId === 'no-restricted-syntax',
        );

        expect(messages).toEqual([]);
      }
    });
  });

  describe('bypass shapes', () => {
    // docs/ENGINEERING_RULES_SHARED.md § `no-restricted-syntax` selectors: a computed member, a bare
    // destructured call and a literal nested in a conditional.
    it.each([
      ['React.createElement', "export const a = React.createElement('input', null);"],
      ["React['createElement']", "export const a = React['createElement']('textarea', null);"],
      [
        'a bare destructured createElement',
        "const { createElement } = React; export const a = createElement('select', null);",
      ],
      [
        'a literal inside a conditional',
        "export const a = React.createElement(flag ? 'input' : 'span', null);",
      ],
      [
        'a literal inside a logical expression',
        "export const a = React.createElement(tag || 'textarea', null);",
      ],
    ])('flags %s', (_name, source) => {
      expect(rawControlMessages(source, DASHBOARD_PATH)).toHaveLength(1);
    });

    it('does not flag createElement of an ordinary tag', () => {
      expect(
        rawControlMessages("export const a = React.createElement('div', null);", DASHBOARD_PATH),
      ).toEqual([]);
    });

    it('does not flag the word input inside another argument', () => {
      expect(
        rawControlMessages(
          "export const a = React.createElement('div', { 'data-kind': 'input' });",
          DASHBOARD_PATH,
        ),
      ).toEqual([]);
    });
  });

  describe('raw <button> ban (TD58-S13)', () => {
    const BESPOKE_BUTTON_FILES = [
      'features/booking/components/dashboard/bookings/reschedule/SlotConflictAlert.tsx',
      'features/booking/components/dashboard/schedule/ScheduleWeekView.tsx',
      'features/booking/components/dashboard/schedule/TimelineBlockShell.tsx',
      'features/booking/components/dashboard/services/IntakeVersionHistoryCard.tsx',
      'features/customer/components/InformationCompletionPrompt.tsx',
      'features/customer/components/SwitchTenantClient.tsx',
      'features/customer/components/TenantOptionRow.tsx',
      'features/platform/components/hotsite/PreviewSelectionWrapper.tsx',
      'features/platform/components/hotsite/modules/BookingPhotoThumbnailGroup.tsx',
      'features/staff/components/SelectStaffTenantClient.tsx',
      'shells/dashboard/components/BottomNav.tsx',
      'shells/dashboard/components/Topbar.tsx',
      'shells/dashboard/components/WeekNav.tsx',
    ];
    const RAW_BUTTON = '<button type="button">Salvar</button>';

    // The two exemption tiers as the loaded config declares them, so this spec cannot drift from it.
    function declaredFiles(...mustInclude: string[]): string[] {
      const entry = productionConfig.find((config) => {
        const files = (config.files ?? []).flat();
        return mustInclude.every((path) => files.includes(path));
      });
      return (entry?.files ?? []).flat();
    }

    it('the config exempts exactly the reviewed bespoke files, no more and no fewer', () => {
      const declared = declaredFiles('shells/dashboard/components/WeekNav.tsx');

      expect([...declared].sort()).toEqual([...BESPOKE_BUTTON_FILES].sort());
    });

    it('no bespoke button file also sits in the raw-form-control exemption', () => {
      const formControlExempt = declaredFiles('shared/components/ui/**');
      const overlaps = declaredFiles('shells/dashboard/components/WeekNav.tsx').filter((path) =>
        formControlExempt.some((entry) =>
          entry.endsWith('/**') ? path.startsWith(entry.slice(0, -2)) : path === entry,
        ),
      );

      expect(formControlExempt.length).toBeGreaterThan(0);
      expect(overlaps).toEqual([]);
    });

    it('flags a raw <button> in a dashboard and in an account path, naming ui/button', () => {
      for (const path of [DASHBOARD_PATH, ACCOUNT_PATH]) {
        const messages = rawControlMessages(component(RAW_BUTTON), path);

        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain('ui/button');
      }
    });

    it('flags a raw <button> in a folder the rule has never heard of (it fails closed)', () => {
      expect(
        rawControlMessages(
          component(RAW_BUTTON),
          'features/staff/components/brand-new-folder/example.tsx',
        ),
      ).toHaveLength(1);
    });

    it('flags a raw <button> in a file next to an exempt one (the exemption is by exact path)', () => {
      expect(
        rawControlMessages(component(RAW_BUTTON), 'shells/dashboard/components/WeekNavExtras.tsx'),
      ).toHaveLength(1);
    });

    it.each([
      ['React.createElement', "export const a = React.createElement('button', null);"],
      ["React['createElement']", "export const a = React['createElement']('button', null);"],
      [
        'a bare destructured createElement',
        "const { createElement } = React; export const a = createElement('button', null);",
      ],
      [
        'a literal inside a conditional',
        "export const a = React.createElement(flag ? 'button' : 'span', null);",
      ],
    ])('flags the bypass shape %s', (_name, source) => {
      expect(rawControlMessages(source, DASHBOARD_PATH)).toHaveLength(1);
    });

    it('allows the primitives, each branded tree and a spec file', () => {
      for (const path of [
        'shared/components/ui/button.tsx',
        'features/booking/components/public/SlotPicker.tsx',
        'features/platform/components/public/ContactField.tsx',
        'shared/components/hotsite/branded-feedback-message.tsx',
        'shells/hotsite/components/ChatbotPanel.tsx',
        'features/booking/components/dashboard/x.spec.tsx',
      ]) {
        expect(rawControlMessages(component(RAW_BUTTON), path)).toEqual([]);
      }
    });

    it.each(BESPOKE_BUTTON_FILES)('allows a raw <button> in the bespoke file %s', (path) => {
      expect(rawControlMessages(component(RAW_BUTTON), path)).toEqual([]);
    });

    it('lifts only the button ban from a bespoke file: a raw input, fetch() and a role="alert" stay banned', () => {
      const path = 'shells/dashboard/components/WeekNav.tsx';

      expect(rawControlMessages(component('<input />'), path)).toHaveLength(1);
      expect(
        lint("export async function load() { return fetch('https://example.com'); }", path),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('sanctioned BFF transport helpers'),
          }),
        ]),
      );
      expect(lint(component('<div role="alert">oops</div>'), path)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('FeedbackMessage'),
          }),
        ]),
      );
    });
  });

  describe('branded text controls (TD51-S06)', () => {
    // Only the TD51-S06 selectors: they carry that tag and name the branded atom.
    function brandedMessages(source: string, filePath: string) {
      return lint(source, filePath).filter(
        (message) =>
          message.ruleId === 'no-restricted-syntax' && message.message.includes('TD51-S06'),
      );
    }
    const BRANDED_TREES = [
      'features/booking/components/public/Example.tsx',
      'features/platform/components/public/Example.tsx',
      'features/customer/components/InformationCompletionPhoneField.tsx',
      'shells/hotsite/components/Example.tsx',
      'shared/components/hotsite/example.tsx',
    ];

    it.each([
      ['<input>', '<input type="text" />', 'BrandedInput'],
      ['<textarea>', '<textarea />', 'BrandedTextarea'],
      ['<select>', '<select />', 'BrandedSelect'],
    ])('flags a raw %s in every branded tree and names its atom', (_name, jsx, atom) => {
      for (const path of BRANDED_TREES) {
        const messages = brandedMessages(component(jsx), path);

        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain(atom);
      }
    });

    it('flags createElement and a conditional createElement in a branded tree', () => {
      for (const source of [
        "export const a = React.createElement('input', null);",
        "export const a = React.createElement(flag ? 'select' : 'span', null);",
      ]) {
        expect(rawControlMessages(source, 'shells/hotsite/components/Example.tsx')).toHaveLength(1);
      }
    });

    it('still lifts the button and label-for bans across the branded trees', () => {
      const jsx = '<label htmlFor="x"><button type="button">x</button></label>';

      for (const path of BRANDED_TREES) {
        expect(rawControlMessages(component(jsx), path)).toEqual([]);
      }
    });

    it.each([
      'shared/components/hotsite/branded-input.tsx',
      'shared/components/hotsite/branded-textarea.tsx',
      'shared/components/hotsite/branded-select.tsx',
      'features/booking/components/public/AvailabilityAlertFields.tsx',
      'features/booking/components/public/PhotoUpload.tsx',
      'features/booking/components/public/ResourcePicker.tsx',
      'features/booking/components/public/ServiceCard.tsx',
      'features/platform/components/public/ContactField.tsx',
      'features/platform/components/public/LeadFormPhoneField.tsx',
      'features/platform/components/public/LeadFormQuestionField.tsx',
      'shells/hotsite/components/ChatbotPanel.tsx',
    ])('allows a native control in the exact-path file %s', (path) => {
      expect(brandedMessages(component('<input /><textarea /><select />'), path)).toEqual([]);
    });

    describe('the checkbox / radio files', () => {
      const MIXED = 'features/booking/components/public/IntakeQuestionField.tsx';

      it.each([
        ['checkbox', '<input type="checkbox" />'],
        ['radio', '<input type="radio" />'],
        ['file', '<input type="file" />'],
        ['hidden', '<input type="hidden" />'],
        ['a braced literal', "<input type={'checkbox'} />"],
        ['a template literal', '<input type={`radio`} />'],
      ])('allow a static %s input', (_name, jsx) => {
        for (const path of [
          MIXED,
          'features/booking/components/public/IntakeAnswersStep.tsx',
          'features/booking/components/public/IntakeAttendeesList.tsx',
        ]) {
          expect(brandedMessages(component(jsx), path)).toEqual([]);
        }
      });

      it.each([
        ['a text input', '<input type="text" />', 'BrandedInput'],
        ['an input with no type', '<input />', 'BrandedInput'],
        ['a number input', '<input type="number" />', 'BrandedInput'],
        ['a type held in a variable', '<input type={kind} />', 'BrandedInput'],
        ['a conditional type', "<input type={flag ? 'checkbox' : 'text'} />", 'BrandedInput'],
        ['a textarea', '<textarea />', 'BrandedTextarea'],
        ['a select', '<select />', 'BrandedSelect'],
      ])('still flag %s', (_name, jsx, atom) => {
        const messages = brandedMessages(component(jsx), MIXED);

        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain(atom);
      });
    });
  });

  describe('the wrapping-label allowance holds because jsx-a11y enforces it', () => {
    it('reports a label with no htmlFor and no control inside it', () => {
      const messages = lint(component('<label>Name</label>'), DASHBOARD_PATH).filter(
        (message) => message.ruleId === 'jsx-a11y/label-has-associated-control',
      );

      expect(messages).toHaveLength(1);
    });
  });
});
