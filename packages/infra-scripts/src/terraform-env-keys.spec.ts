import { extractModuleEnvKeys } from './terraform-env-keys';

describe('extractModuleEnvKeys', () => {
  it('extracts keys from both env_vars and secret_env_vars in the named module', () => {
    const hcl = `
      module "cloudrun_backend" {
        source = "../../modules/cloudrun-service"

        env_vars = {
          NODE_ENV = "production"
          DB_HOST  = try(module.database[0].private_ip, "")
        }

        secret_env_vars = {
          DB_PASSWORD = module.secrets.secret_ids["db-password"]
        }
      }
    `;

    expect(new Set(extractModuleEnvKeys(hcl, 'cloudrun_backend'))).toEqual(
      new Set(['NODE_ENV', 'DB_HOST', 'DB_PASSWORD']),
    );
  });

  it('does not leak keys from a different module in the same file', () => {
    const hcl = `
      module "cloudrun_backend" {
        env_vars = {
          BACKEND_ONLY = "x"
        }
      }

      module "cloudrun_bff" {
        env_vars = {
          BFF_ONLY = "y"
        }
      }
    `;

    expect(extractModuleEnvKeys(hcl, 'cloudrun_backend')).toEqual(['BACKEND_ONLY']);
    expect(extractModuleEnvKeys(hcl, 'cloudrun_bff')).toEqual(['BFF_ONLY']);
  });

  it('correctly balances braces around interpolated values (${...}) inside the map', () => {
    const hcl = `
      module "cloudrun_backend" {
        env_vars = {
          PUBSUB_PUSH_AUDIENCE = "\${local.backend_self_uri}/pubsub/push"
        }
      }
    `;

    expect(extractModuleEnvKeys(hcl, 'cloudrun_backend')).toEqual(['PUBSUB_PUSH_AUDIENCE']);
  });

  it('returns an empty array when the module has no env_vars or secret_env_vars block', () => {
    const hcl = `
      module "cloudrun_web" {
        source = "../../modules/cloudrun-service"
      }
    `;

    expect(extractModuleEnvKeys(hcl, 'cloudrun_web')).toEqual([]);
  });

  it('throws when the named module does not exist', () => {
    const hcl = `module "cloudrun_backend" { env_vars = {} }`;

    expect(() => extractModuleEnvKeys(hcl, 'cloudrun_missing')).toThrow(/not found/);
  });
});
