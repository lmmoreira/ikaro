import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkEnvContract } from './env-contract';

function writeFixtureRepo(options: {
  backendTfHasDbHost: boolean;
  webTfHasBffUrl: boolean;
}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'env-contract-fixture-'));

  const backendSchemaDir = path.join(root, 'apps/backend/src/config');
  fs.mkdirSync(backendSchemaDir, { recursive: true });
  fs.writeFileSync(
    path.join(backendSchemaDir, 'env.validation.ts'),
    `
      const schema = z.object({
        DB_HOST: z.string(),
        PORT: z.coerce.number().default(3001),
      });
    `,
  );

  const bffSchemaDir = path.join(root, 'apps/bff/src/config');
  fs.mkdirSync(bffSchemaDir, { recursive: true });
  fs.writeFileSync(
    path.join(bffSchemaDir, 'env.validation.ts'),
    `
      const schema = z.object({
        BACKEND_INTERNAL_URL: z.url(),
      });
    `,
  );

  const webRuntimeEnvDir = path.join(root, 'apps/web/shared/lib/runtime-env');
  fs.mkdirSync(webRuntimeEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(webRuntimeEnvDir, 'public-env.ts'),
    `
      const PUBLIC_ENV_KEYS = ['NEXT_PUBLIC_BFF_URL'] as const;
    `,
  );

  const backendEnvVars = options.backendTfHasDbHost ? 'DB_HOST = "x"' : '';
  const webEnvVars = options.webTfHasBffUrl ? 'NEXT_PUBLIC_BFF_URL = "x"' : '';

  for (const env of ['staging', 'prod']) {
    const envDir = path.join(root, `infra/terraform/envs/${env}`);
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, 'main.tf'),
      `
        module "cloudrun_backend" {
          env_vars = {
            ${backendEnvVars}
          }
        }

        module "cloudrun_bff" {
          env_vars = {
            BACKEND_INTERNAL_URL = "x"
          }
        }

        module "cloudrun_web" {
          env_vars = {
            ${webEnvVars}
          }
        }
      `,
    );
  }

  return root;
}

describe('checkEnvContract', () => {
  const fixtureRoots: string[] = [];

  afterEach(() => {
    for (const root of fixtureRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports no violations when every required key is wired in both env roots', () => {
    const root = writeFixtureRepo({ backendTfHasDbHost: true, webTfHasBffUrl: true });
    fixtureRoots.push(root);

    expect(checkEnvContract(root)).toEqual([]);
  });

  it('does not flag PORT even though it is never wired in Terraform (exempt: platform-reserved)', () => {
    const root = writeFixtureRepo({ backendTfHasDbHost: true, webTfHasBffUrl: true });
    fixtureRoots.push(root);

    const violations = checkEnvContract(root);
    expect(violations.some((v) => v.missingKeys.includes('PORT'))).toBe(false);
  });

  it('reports a violation per env root missing a required key', () => {
    const root = writeFixtureRepo({ backendTfHasDbHost: false, webTfHasBffUrl: true });
    fixtureRoots.push(root);

    const violations = checkEnvContract(root);

    expect(violations).toHaveLength(2);
    for (const violation of violations) {
      expect(violation.appName).toBe('backend');
      expect(violation.cloudRunModule).toBe('cloudrun_backend');
      expect(violation.missingKeys).toEqual(['DB_HOST']);
    }
    expect(violations.map((v) => v.envRoot).sort()).toEqual([
      'infra/terraform/envs/prod/main.tf',
      'infra/terraform/envs/staging/main.tf',
    ]);
  });

  it('reports a violation for web missing a required key in each env root', () => {
    const root = writeFixtureRepo({ backendTfHasDbHost: true, webTfHasBffUrl: false });
    fixtureRoots.push(root);

    const violations = checkEnvContract(root);
    const webViolations = violations.filter((v) => v.appName === 'web');

    expect(webViolations).toHaveLength(2);
    for (const violation of webViolations) {
      expect(violation.cloudRunModule).toBe('cloudrun_web');
      expect(violation.missingKeys).toEqual(['NEXT_PUBLIC_BFF_URL']);
    }
    expect(webViolations.map((v) => v.envRoot).sort()).toEqual([
      'infra/terraform/envs/prod/main.tf',
      'infra/terraform/envs/staging/main.tf',
    ]);
  });

  it('checks web against prod too, now that M17-S26 has widened it to ALL_ENV_ROOTS', () => {
    const root = writeFixtureRepo({ backendTfHasDbHost: true, webTfHasBffUrl: false });
    fixtureRoots.push(root);

    const violations = checkEnvContract(root);

    expect(violations.some((v) => v.appName === 'web' && v.envRoot.includes('prod'))).toBe(true);
  });

  it("has zero violations against this repo's real env.validation.ts + Terraform files (regression guard)", () => {
    const realRepoRoot = path.resolve(__dirname, '../../..');

    expect(checkEnvContract(realRepoRoot)).toEqual([]);
  });
});
