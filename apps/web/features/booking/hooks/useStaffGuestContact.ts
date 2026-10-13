'use client';

import { useSyncExternalStore } from 'react';

export interface StaffGuestContact {
  readonly contactName: string;
  readonly contactPhone: string;
  readonly contactEmail: string;
}

// The contact staff typed for a person who is not in the system travels from the chooser to the
// booking steps in memory only (decided at M23-S40 discovery): a name, e-mail and phone never go
// into a URL, so a reload returns to the chooser. A module-level store survives the client-side
// navigation between the two pages and nothing else.
let guestContact: StaffGuestContact | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function setStaffGuestContact(contact: StaffGuestContact): void {
  guestContact = contact;
  notify();
}

export function clearStaffGuestContact(): void {
  guestContact = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStaffGuestContact(): StaffGuestContact | null {
  return useSyncExternalStore(
    subscribe,
    () => guestContact,
    () => null,
  );
}
