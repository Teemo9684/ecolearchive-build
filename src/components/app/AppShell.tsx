import { useIncomingAlerts } from "@/lib/useIncomingAlerts";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Home, Plus, Inbox, Send, FolderOpen, Users, Baby, Package, TrendingUp, BarChart3,
  Settings, Info, Menu, Moon, Sun, X, Search, GraduationCap,
} from "lucide-react";
import { useCollection, useSettings } from "@/lib/db/hooks";
import type { Correspondence } from "@/lib/db/types";
import { NAV_FR } from "@/lib/labels";
import { cn } from "@/lib/utils";
import bookLogo from "@/assets/logo-book.png";
import packageInfo from "../../../package.json";
import { isDesktopRuntime } from "@/lib/db/desktop";

type NavItem = { to: string; label: string; icon: typeof Home; badge?: boolean; hash?: string };
const NAV: NavItem[][] = [
  [
    { to: "/", label: "الصفحة الرئيسية", icon: Home },
    { to: "/templates", label: "إنشاء وثيقة", icon: Plus },
    { to: "/mail/incoming", label: "البريد الوارد", icon: Inbox, badge: true },
    { to: "/mail/outgoing", label: "البريد الصادر", icon: Send },
    { to: "/archive", label: "الأرشيف الرقمي", icon: FolderOpen },
    { to: "/employees", label: "عمال المؤسسة", icon: Users },
    { to: "/teachers", label: "العمال التربويون", icon: GraduationCap },
    { to: "/students", label: "شؤون التلاميذ", icon: Baby },
    { to: "/inventory", label: "الجرد المدرسي", icon: Package },
    { to: "/admin-files", label: "التنقيط والمردودية", icon: TrendingUp },
    { to: "/reports", label: "التقارير والإحصائيات", icon: BarChart3 },
  ],
  [
    { to: "/search", label: "البحث الشامل", icon: Search },
  ],
  [
    { to: "/settings", label: "الإعدادات", icon: Settings },
  ],
];

export function AppShell({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const corr = useCollection<Correspondence>("correspondences");
  const pendingIn = useIncomingAlerts(corr.data, path);
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [q, setQ] = useState("");
  const [installedVersion, setInstalledVersion] = useState(packageInfo.version);
  const fr = settings.locale === "fr";
  const home = path === "/";

  useEffect(() => { setDark(localStorage.getItem("ui-theme") === "dark"); }, []);
  useEffect(() => { if (isDesktopRuntime()) void window.__TAURI_INTERNALS__!.invoke("installed_app_version").then((v: unknown) => { if (typeof v === "string") setInstalledVersion(v); }).catch(() => {}); }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => setOpen(false), [path]);

  const isActive = (to: string, label: string) =>
    to === "/" ? home : to === "/settings" ? path === "/settings" && label === "الإعدادات" : path.startsWith(to);

  return (
    <div className="flex min-h-screen w-full">
      {open && <div className="fixed inset-0 z-30 bg-foreground/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "no-print sidebar-skin fixed inset-y-0 start-0 z-40 flex w-64 flex-col text-sidebar-foreground transition-transform duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <button className="absolute end-3 top-3 md:hidden" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-5 w-5" /></button>
        <div className="flex flex-col items-center px-4 pb-4 pt-6 text-center">
          <img src={bookLogo} alt="شعار الكتاب" width={128} height={128} className="block h-[8.1rem] w-[8.1rem] object-contain drop-shadow-xl logo-3d-spin md:h-36 md:w-36" />
          <div className="mt-2 font-display text-[16px] font-bold leading-snug">منظومة التسيير الإداري<br /><span className="gold-text">والأرشيف الرقمي</span></div>
          <div className="gold-rule header-gold-shimmer mt-4 w-3/4 opacity-70" />
        </div>
        <nav className="flex-1 overflow-y-auto pb-3">
          {NAV.map((g, gi) => (
            <div key={gi} className={cn(gi > 0 && "mx-5 mt-2 border-t border-sidebar-border pt-2")}>
              {g.map((it) => {
                const active = isActive(it.to, it.label);
                return (
                  <Link
                    key={it.label}
                    to={it.to}
                    hash={it.hash}
                    className={cn(
                      "nav-soft-glow flex items-center gap-3 px-6 py-2.5 text-[15px] transition-colors hover:bg-sidebar-accent",
                      gi > 0 && "px-1",
                      active && "sidebar-active me-0 rounded-e-none rounded-s-none font-bold",
                    )}
                  >
                    <it.icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1">{fr ? NAV_FR[it.to] ?? it.label : it.label}</span>
                    {it.badge && pendingIn > 0 && (
                      <span className="notification-once grid h-6 min-w-6 place-items-center rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground" key={pendingIn}>{pendingIn}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="mx-5 mt-2 border-t border-sidebar-border pt-2">
            <div className="flex items-center gap-3 px-1 py-2.5 text-[15px] opacity-80"><Info className="h-5 w-5" />حول البرنامج — الإصدار {installedVersion}</div>
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn("no-print sticky top-0 z-20 border-b bg-card/95 backdrop-blur", home && "md:hidden")}>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button className="md:hidden" onClick={() => setOpen(true)} aria-label="القائمة"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-primary">{settings.schoolName}</div>
              <div className="truncate text-xs text-muted-foreground">{settings.city} · السنة الدراسية {settings.currentYear}</div>
            </div>
            <form className="ms-auto hidden max-w-md flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); navigate({ to: "/search", search: { q } }); }}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في الوثائق والمراسلات والمستخدمين..."
                  className="h-9 w-full rounded-full border border-input bg-background ps-9 pe-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </form>
            <button onClick={() => { const v = !dark; setDark(v); localStorage.setItem("ui-theme", v ? "dark" : "light"); }}
              className="ms-auto rounded-md p-2 hover:bg-accent sm:ms-0" aria-label="تبديل المظهر">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <div className="gold-rule header-gold-shimmer" />
        </header>
        <main className={cn("flex-1", home ? "p-0" : "p-4 md:p-6")}>{children}</main>
      </div>
    </div>
  );
}
