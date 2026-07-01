import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { type User, getMe, logout } from "~/lib/auth";

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      setChecking(true);
      const pendingUser = (location.state as { user?: User } | null)?.user;

      try {
        const me = await getMe();
        if (cancelled) return;
        if (me) {
          setUser(me);
        } else if (pendingUser) {
          setUser(pendingUser);
        } else {
          navigate("/login", { replace: true });
        }
      } catch {
        if (cancelled) return;
        if (pendingUser) {
          setUser(pendingUser);
        } else {
          navigate("/login", { replace: true });
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate, location.pathname, location.state]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F4F3F8]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#6D4AFF] border-t-transparent" />
          <span className="text-sm text-[#6B6480]">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-dvh overflow-hidden bg-[#F4F3F8]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-30 flex w-[min(16rem,85vw)] flex-col bg-[#1C1340] pt-[env(safe-area-inset-top)] transition-transform duration-200 lg:static lg:w-64 lg:translate-x-0 lg:pt-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6D4AFF]">
            <svg className="size-4 text-white" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 7h16M4 12h10M4 17h7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight text-white">
              Schick
            </div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-[#7B70A8]">
              Admin
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-[#9D98B3] transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            <SidebarLink to="/" icon={<DashboardIcon />} label="Dashboard" exact onNavigate={() => setSidebarOpen(false)} />
            <SidebarLink to="/products" icon={<ProductsIcon />} label="Products" onNavigate={() => setSidebarOpen(false)} />
            <SidebarLink to="/orders" icon={<OrdersIcon />} label="Orders" onNavigate={() => setSidebarOpen(false)} />
            <SidebarLink to="/coupons" icon={<CouponsIcon />} label="Coupons" onNavigate={() => setSidebarOpen(false)} />
            <SidebarLink to="/analytics" icon={<AnalyticsIcon />} label="Analytics" onNavigate={() => setSidebarOpen(false)} />
            <SidebarLink to="/users" icon={<UsersIcon />} label="Register" onNavigate={() => setSidebarOpen(false)} />
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <SidebarLink to="/settings" icon={<SettingsIcon />} label="Settings" onNavigate={() => setSidebarOpen(false)} />
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6D4AFF]/30 text-xs font-bold text-[#B4A8FF]">
              {user.email[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">
                {user.email}
              </p>
              <p className="text-[10px] text-[#7B70A8]">
                {user.role ?? "Administrator"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="rounded-lg p-1.5 text-[#7B70A8] transition hover:bg-white/10 hover:text-white"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#E5E3EE] bg-white px-4 pt-[env(safe-area-inset-top)] sm:h-16 sm:gap-3 sm:px-5 lg:pt-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="-ml-1 rounded-lg p-2 text-[#6B6480] hover:bg-[#F4F3F8] lg:hidden"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            <HamburgerIcon />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 rounded-full bg-[#F4F3F8] px-2.5 py-1.5 sm:px-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="hidden text-xs font-medium text-[#6B6480] sm:inline">
              Backend online
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  exact,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-[#6D4AFF]/20 text-white"
            : "text-[#9D98B3] hover:bg-white/[0.07] hover:text-white",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={[
              "shrink-0 transition-colors",
              isActive ? "text-[#A78BFA]" : "text-[#7B70A8]",
            ].join(" ")}
          >
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

function DashboardIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l9 4.5V17L12 21.5 3 17V6.5L12 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 2v19.5M3 6.5l9 4.5 9-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 17l4-5 4 3 4-6 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 21h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CouponsIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <path d="M12.5 3H7a2 2 0 0 0-2 2v5.5l9.5 9.5a2 2 0 0 0 2.83 0l4.17-4.17a2 2 0 0 0 0-2.83L12.5 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="1" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
