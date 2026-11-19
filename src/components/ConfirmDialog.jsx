"use client";

import Modal from '@/components/Modal';

export default function ConfirmDialog({
  open,
  title = 'Confirm action',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <Modal isOpen={open} onClose={onCancel} title={title} ariaLabel={title}>
      {description && <p className="mb-6 text-sm text-gray-600">{description}</p>}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
            danger
              ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-600'
              : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
