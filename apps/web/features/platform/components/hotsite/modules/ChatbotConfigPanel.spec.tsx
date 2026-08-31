// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatbotModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { getChatbotCapStatus } from '@/features/platform/api/tenant-settings';
import { ChatbotConfigPanel } from './ChatbotConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  getChatbotCapStatus: vi.fn(),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-a-id', tenantSlug: 'tenant-a' }),
}));

const mockGetChatbotCapStatus = vi.mocked(getChatbotCapStatus);

const CHATBOT: ChatbotModuleData = {};

// PillSelect (TD37-S23, Codex review PR #450) shares one static data-testid per group,
// disambiguated by a separate data-value attribute rather than a computed data-testid.
function getPillOption(testId: string, value: string) {
  return screen.getAllByTestId(testId).find((el) => el.dataset.value === value)!;
}

function renderPanel(data: ChatbotModuleData = CHATBOT, onChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithIntl(
    <QueryClientProvider client={queryClient}>
      <ChatbotConfigPanel data={writeModuleData(data)} onChange={onChange} />
    </QueryClientProvider>,
  );
}

describe('ChatbotConfigPanel', () => {
  it('renders the standing availability note regardless of cap status', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });

    renderPanel();

    expect(screen.getByTestId('chatbot-availability-note')).toBeInTheDocument();
    await waitFor(() => expect(mockGetChatbotCapStatus).toHaveBeenCalled());
  });

  it('shows the cap-reached banner only when dailyCapReachedToday is true', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: true });

    renderPanel();

    expect(await screen.findByTestId('chatbot-cap-reached-banner')).toBeInTheDocument();
  });

  it('hides the cap-reached banner when dailyCapReachedToday is false', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });

    renderPanel();

    await waitFor(() => expect(mockGetChatbotCapStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('chatbot-cap-reached-banner')).not.toBeInTheDocument();
  });

  it('hides the cap-reached banner while the status query is still pending', () => {
    mockGetChatbotCapStatus.mockReturnValue(new Promise(() => {}));

    renderPanel();

    expect(screen.queryByTestId('chatbot-cap-reached-banner')).not.toBeInTheDocument();
  });

  it('editing the bot name calls onChange with only that field updated', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderPanel(CHATBOT, onChange);

    await user.type(screen.getByLabelText('Nome do assistente (opcional)'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...CHATBOT, botName: 'X' }));
  });

  it('editing the welcome message calls onChange with only that field updated', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderPanel(CHATBOT, onChange);

    await user.type(screen.getByLabelText('Mensagem de boas-vindas'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...CHATBOT, welcomeMessage: 'X' }));
  });

  it('selecting the inline variant calls onChange with the updated variant', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderPanel(CHATBOT, onChange);

    await user.click(getPillOption('chatbot-variant', 'inline'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...CHATBOT, variant: 'inline' }));
  });

  it('selecting the secondary accent color calls onChange with the updated value', async () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderPanel(CHATBOT, onChange);

    await user.click(getPillOption('chatbot-accent-color', 'secondary'));

    expect(onChange).toHaveBeenCalledWith(
      writeModuleData({ ...CHATBOT, accentColor: 'secondary' }),
    );
  });

  it('pre-fills fields from existing module data', () => {
    mockGetChatbotCapStatus.mockResolvedValue({ dailyCapReachedToday: false });

    renderPanel({
      variant: 'inline',
      accentColor: 'secondary',
      botName: 'Beloa',
      welcomeMessage: 'Oi!',
    });

    expect(screen.getByLabelText('Nome do assistente (opcional)')).toHaveValue('Beloa');
    expect(screen.getByLabelText('Mensagem de boas-vindas')).toHaveValue('Oi!');
    expect(getPillOption('chatbot-variant', 'inline')).toHaveAttribute('aria-checked', 'true');
    expect(getPillOption('chatbot-accent-color', 'secondary')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
