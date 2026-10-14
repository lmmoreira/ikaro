// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearStaffGuestContact,
  setStaffGuestContact,
  useStaffGuestContact,
} from './useStaffGuestContact';

const CONTACT = {
  contactName: 'Maria',
  contactPhone: '+5531999990000',
  contactEmail: 'maria@example.com',
};

describe('useStaffGuestContact', () => {
  afterEach(() => act(() => clearStaffGuestContact()));

  it('is empty until a contact is typed', () => {
    const { result } = renderHook(() => useStaffGuestContact());

    expect(result.current).toBeNull();
  });

  it('hands the contact to the page that mounts after the chooser, and forgets it on clear', () => {
    act(() => setStaffGuestContact(CONTACT));
    const { result } = renderHook(() => useStaffGuestContact());
    expect(result.current).toEqual(CONTACT);

    act(() => clearStaffGuestContact());
    expect(result.current).toBeNull();
  });

  it('updates a mounted reader when the contact changes', () => {
    const { result } = renderHook(() => useStaffGuestContact());

    act(() => setStaffGuestContact(CONTACT));

    expect(result.current).toEqual(CONTACT);
  });
});
