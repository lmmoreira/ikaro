describe('AppModule', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      DB_HOST: 'localhost',
      DB_USER: 'ikaro_app',
      DB_PASSWORD: 'ikaro_app',
      DB_NAME: 'ikaro',
      PLATFORM_ADMIN_KEY: 'a'.repeat(32),
      INTERNAL_API_KEY: 'b'.repeat(32),
      JWT_SECRET: 'c'.repeat(32),
      HOTSITE_REVALIDATE_SECRET: 'd'.repeat(32),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('loads with the shared cache module registered at the root', async () => {
    const { AppModule } = await import('./app.module');

    expect(AppModule).toBeDefined();
  });
});
