import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "~/lib/i18n";

export type NotificationType = "success" | "error";

interface Notification {
  id: number;
  message: string;
  type: NotificationType;
}

interface NotificationContextValue {
  notify: (message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const AUTO_HIDE_MS = 3000;
const EXIT_MS = 300;

export function useNotify(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotify must be used within NotificationProvider");
  }
  return ctx;
}

function NotificationBar({
  message,
  type,
  visible,
  onDismiss,
}: {
  message: string;
  type: NotificationType;
  visible: boolean;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const isSuccess = type === "success";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm font-medium text-white shadow-lg transition-transform duration-300 ease-out",
        isSuccess ? "bg-[#1B8348]" : "bg-[#CE3A3A]",
        visible ? "translate-y-0" : "-translate-y-full",
      ].join(" ")}
    >
      <span className="shrink-0" aria-hidden="true">
        {isSuccess ? <CheckIcon /> : <ErrorIcon />}
      </span>
      <span className="text-center">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
        aria-label={t("common.dismissNotification")}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const notify = useCallback(
    (message: string, type: NotificationType = "success") => {
      clearTimers();
      setNotification({ id: Date.now(), message, type });
      setVisible(true);
    },
    [clearTimers]
  );

  useEffect(() => {
    if (!visible || !notification) return;

    hideTimer.current = setTimeout(() => {
      setVisible(false);
    }, AUTO_HIDE_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, notification]);

  useEffect(() => {
    if (visible || !notification) return;

    exitTimer.current = setTimeout(() => {
      setNotification(null);
    }, EXIT_MS);

    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [visible, notification]);

  useEffect(() => clearTimers, [clearTimers]);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      {notification && (
        <NotificationBar
          message={notification.message}
          type={notification.type}
          visible={visible}
          onDismiss={dismiss}
        />
      )}
    </NotificationContext.Provider>
  );
}

function CheckIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
