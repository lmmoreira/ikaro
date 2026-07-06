import { deriveStaffStatus, toStaffListItem, toStaffListResponse } from './staff.mapper';
import { StaffItem } from './staff.types';

function buildItem(overrides?: Partial<StaffItem>): StaffItem {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    email: 'ana@lavacar.com.br',
    name: 'Ana Pereira',
    role: 'MANAGER',
    isActive: true,
    googleOAuthId: 'google-sub-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('deriveStaffStatus', () => {
  it('returns PENDING for a fresh invite (isActive=true, never linked a Google account)', () => {
    // Staff.invite() provisions every row as isActive=true from the start (M13-S13 security
    // fix), so a brand-new invitee already has isActive=true *and* googleOAuthId=null. This
    // must resolve to PENDING, not ACTIVE — googleOAuthId is the real activation signal.
    expect(deriveStaffStatus(buildItem({ isActive: true, googleOAuthId: null }))).toBe('PENDING');
  });

  it('returns ACTIVE for a member that has linked a Google account and is active', () => {
    expect(deriveStaffStatus(buildItem({ isActive: true, googleOAuthId: 'google-sub-1' }))).toBe(
      'ACTIVE',
    );
  });

  it('returns PENDING for an inactive member that never linked a Google account', () => {
    expect(deriveStaffStatus(buildItem({ isActive: false, googleOAuthId: null }))).toBe('PENDING');
  });

  it('returns DEACTIVATED for an inactive member that had activated before', () => {
    expect(deriveStaffStatus(buildItem({ isActive: false, googleOAuthId: 'google-sub-1' }))).toBe(
      'DEACTIVATED',
    );
  });
});

describe('toStaffListItem', () => {
  it('strips googleOAuthId and adds the derived status', () => {
    const item = toStaffListItem(buildItem({ isActive: false, googleOAuthId: null }));

    expect(item).toEqual({
      id: '30000000-0000-4000-8000-000000000001',
      email: 'ana@lavacar.com.br',
      name: 'Ana Pereira',
      role: 'MANAGER',
      isActive: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'PENDING',
    });
    expect(item).not.toHaveProperty('googleOAuthId');
  });
});

describe('toStaffListResponse', () => {
  it('maps every item and passes pagination through unchanged', () => {
    const pagination = { limit: 50, offset: 0, total: 2, hasMore: false, nextOffset: null };
    const response = toStaffListResponse({
      items: [buildItem(), buildItem({ id: '30000000-0000-4000-8000-000000000002' })],
      pagination,
    });

    expect(response.items).toHaveLength(2);
    expect(response.items[0]!.status).toBe('ACTIVE');
    expect(response.pagination).toBe(pagination);
  });
});
