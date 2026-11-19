"use client";

import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

export function ConfirmationDialog({ state, close }) {
  return (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
}

export default function useConfirm() {
  const resolverRef = useRef(null);
  const [dialog, setDialog] = useState({ open: false });

  const close = useCallback((confirmed) => {
    setDialog((current) => ({ ...current, open: false }));
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    resolverRef.current = resolve;
    setDialog({ open: true, ...options });
  }), []);

  return { confirm, dialog: <ConfirmationDialog state={dialog} close={close} /> };
}
