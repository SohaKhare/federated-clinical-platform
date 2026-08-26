"use client";
import React from 'react';
import styles from './Toast.module.css';
import { useToast } from '@/lib/ToastContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className={styles.toastContainer} aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        let icon = <CheckCircle2 size={16} />;
        let iconClass = styles.successIcon;

        if (toast.type === 'error') {
          icon = <AlertCircle size={16} />;
          iconClass = styles.errorIcon;
        } else if (toast.type === 'info') {
          icon = <Info size={16} />;
          iconClass = styles.infoIcon;
        }

        return (
          <div key={toast.id} className={styles.toastItem}>
            <div className={`${styles.iconWrapper} ${iconClass}`}>
              {icon}
            </div>
            <div className={styles.messageContent}>{toast.message}</div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss alert"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
