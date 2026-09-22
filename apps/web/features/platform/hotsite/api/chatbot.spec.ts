import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import { fetchChatbotStatusClient, sendChatbotMessageClient } from './chatbot';

const mock = new MockAdapter(bffClient);

afterEach(() => mock.reset());

describe('fetchChatbotStatusClient', () => {
  it('returns the availability status via bffClient (same-origin /v1 gateway)', async () => {
    mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });

    const result = await fetchChatbotStatusClient('lavacar-beloauto');

    expect(result).toEqual({ available: true });
    expect(mock.history.get?.[0]?.headers?.['X-Tenant-Slug']).toBe('lavacar-beloauto');
  });

  it('rejects when the BFF returns an error', async () => {
    mock.onGet('/public/platform/chatbot/status').reply(500);

    await expect(fetchChatbotStatusClient('lavacar-beloauto')).rejects.toThrow();
  });
});

describe('sendChatbotMessageClient', () => {
  it('sends the message and returns the sessionId + reply', async () => {
    mock
      .onPost('/public/platform/chatbot/messages')
      .reply(200, { sessionId: 'session-1', reply: 'Olá!' });

    const result = await sendChatbotMessageClient('lavacar-beloauto', { message: 'Oi' });

    expect(result).toEqual({ sessionId: 'session-1', reply: 'Olá!' });
    expect(mock.history.post?.[0]?.headers?.['X-Tenant-Slug']).toBe('lavacar-beloauto');
    expect(JSON.parse(mock.history.post?.[0]?.data)).toEqual({ message: 'Oi' });
  });

  it('forwards an existing sessionId on subsequent messages', async () => {
    mock
      .onPost('/public/platform/chatbot/messages')
      .reply(200, { sessionId: 'session-1', reply: 'Claro!' });

    await sendChatbotMessageClient('lavacar-beloauto', {
      sessionId: 'session-1',
      message: 'E aos domingos?',
    });

    expect(JSON.parse(mock.history.post?.[0]?.data)).toEqual({
      sessionId: 'session-1',
      message: 'E aos domingos?',
    });
  });

  it('rejects when the BFF returns an error', async () => {
    mock.onPost('/public/platform/chatbot/messages').reply(429);

    await expect(sendChatbotMessageClient('lavacar-beloauto', { message: 'Oi' })).rejects.toThrow();
  });
});
