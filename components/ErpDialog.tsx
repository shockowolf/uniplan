'use client';

import { ReactNode, useEffect } from 'react';

type ErpDialogProps = {
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function ErpDialog({ children, footer, onClose, open, title }: ErpDialogProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="erp-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section aria-modal="true" className="erp-dialog" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="erp-dialog-head">
          <h2>{title}</h2>
          <button aria-label="닫기" className="erp-icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="erp-dialog-body">{children}</div>
        {footer ? <footer className="erp-dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
