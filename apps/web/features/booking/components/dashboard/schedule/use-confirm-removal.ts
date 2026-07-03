'use client';

import { useRef, useState } from 'react';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';

interface UseConfirmRemovalOptions {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (id: string) => Promise<void>;
  readonly getErrorMessage: (err: unknown) => string;
}

export function useConfirmRemoval({
  open,
  onClose,
  onSubmit,
  getErrorMessage,
}: UseConfirmRemovalOptions): {
  readonly dialogRef: ReturnType<typeof useModalDialog>;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly confirmRemoval: (id: string) => Promise<void>;
} {
  const dialogRef = useModalDialog(open);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  async function confirmRemoval(id: string): Promise<void> {
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return { dialogRef, isSubmitting, error, confirmRemoval };
}
