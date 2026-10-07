import { ConfigModule } from '@nestjs/config';

// Integration tests configure themselves through process.env alone (integration-global-setup.ts
// and each spec). ConfigModule.forRoot() with no options would also read a real, gitignored
// apps/backend/.env — which CI's fresh checkout never has — so a value set there for local dev or
// Playwright (CHATBOT_LLM_PROVIDER=fake, say) would silently change what a spec exercises.
// process.env is still merged in, so everything the harness exports keeps working.
export function testConfigModule() {
  return ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true });
}
