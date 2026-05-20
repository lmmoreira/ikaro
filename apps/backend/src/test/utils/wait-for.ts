export async function waitFor(condition: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}
