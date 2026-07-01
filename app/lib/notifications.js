import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState, } from "react";
const NotificationContext = createContext(null);
const AUTO_HIDE_MS = 3000;
const EXIT_MS = 300;
export function useNotify() {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        throw new Error("useNotify must be used within NotificationProvider");
    }
    return ctx;
}
function NotificationBar({ message, type, visible, onDismiss, }) {
    const isSuccess = type === "success";
    return (_jsxs("div", { role: "alert", "aria-live": "polite", className: [
            "fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sm font-medium text-white shadow-lg transition-transform duration-300 ease-out",
            isSuccess ? "bg-[#1B8348]" : "bg-[#CE3A3A]",
            visible ? "translate-y-0" : "-translate-y-full",
        ].join(" "), children: [_jsx("span", { className: "shrink-0", "aria-hidden": "true", children: isSuccess ? _jsx(CheckIcon, {}) : _jsx(ErrorIcon, {}) }), _jsx("span", { className: "text-center", children: message }), _jsx("button", { type: "button", onClick: onDismiss, className: "absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/80 transition hover:bg-white/10 hover:text-white", "aria-label": "Dismiss notification", children: _jsx(CloseIcon, {}) })] }));
}
export function NotificationProvider({ children, }) {
    const [notification, setNotification] = useState(null);
    const [visible, setVisible] = useState(false);
    const hideTimer = useRef(null);
    const exitTimer = useRef(null);
    const clearTimers = useCallback(() => {
        if (hideTimer.current)
            clearTimeout(hideTimer.current);
        if (exitTimer.current)
            clearTimeout(exitTimer.current);
    }, []);
    const dismiss = useCallback(() => {
        setVisible(false);
    }, []);
    const notify = useCallback((message, type = "success") => {
        clearTimers();
        setNotification({ id: Date.now(), message, type });
        setVisible(true);
    }, [clearTimers]);
    useEffect(() => {
        if (!visible || !notification)
            return;
        hideTimer.current = setTimeout(() => {
            setVisible(false);
        }, AUTO_HIDE_MS);
        return () => {
            if (hideTimer.current)
                clearTimeout(hideTimer.current);
        };
    }, [visible, notification]);
    useEffect(() => {
        if (visible || !notification)
            return;
        exitTimer.current = setTimeout(() => {
            setNotification(null);
        }, EXIT_MS);
        return () => {
            if (exitTimer.current)
                clearTimeout(exitTimer.current);
        };
    }, [visible, notification]);
    useEffect(() => clearTimers, [clearTimers]);
    return (_jsxs(NotificationContext.Provider, { value: { notify }, children: [children, notification && (_jsx(NotificationBar, { message: notification.message, type: notification.type, visible: visible, onDismiss: dismiss }))] }));
}
function CheckIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z", clipRule: "evenodd" }) }));
}
function ErrorIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { fillRule: "evenodd", d: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z", clipRule: "evenodd" }) }));
}
function CloseIcon() {
    return (_jsx("svg", { className: "size-4", viewBox: "0 0 20 20", fill: "currentColor", children: _jsx("path", { d: "M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" }) }));
}
