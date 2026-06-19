process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3002';
process.env['BACKEND_INTERNAL_URL'] = 'https://backend-test:3001';
process.env['JWT_SECRET'] =
  'test-secret-must-be-at-least-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env['JWT_EXPIRES_IN'] = '7d';
process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
process.env['GOOGLE_CALLBACK_URL'] = 'http://localhost:3002/v1/auth/google/callback';
process.env['ALLOWED_ORIGINS'] = 'http://localhost:3000';
process.env['FRONTEND_URL'] = 'http://localhost:3000';
process.env['CRON_SECRET'] = 'test-cron-secret-must-be-at-least-32-chars!!';
process.env['ENABLE_DEV_AUTH'] = 'true';
process.env['INTERNAL_API_KEY'] = 'test-internal-key-test-internal-key';
