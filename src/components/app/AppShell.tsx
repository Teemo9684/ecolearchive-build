import { useIncomingAlerts } from "@/lib/useIncomingAlerts";
import { checkDesktopUpdateNow } from "@/lib/desktop-update-alert";
import { useGmailUnreadCount } from "@/lib/gmail-unread";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Home, Plus, Inbox, Send, FolderOpen, Users, Baby, Package, TrendingUp, BarChart3,
  Settings, Info, Menu, Moon, Sun, X, Search, GraduationCap, Mail, PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { useCollection, useSettings } from "@/lib/db/hooks";
import type { Correspondence } from "@/lib/db/types";
import { NAV_FR } from "@/lib/labels";
import { cn } from "@/lib/utils";
import bookLogo from "@/assets/logo-book.png";
import packageInfo from "../../../package.json";
import { EmailCenter } from "@/routes/email";
import { isDesktopRuntime } from "@/lib/db/desktop";

type NavItem = { to: string; label: string; icon: typeof Home; badge?: boolean; hash?: string };
const NAV: NavItem[][] = [
  [
    { to: "/", label: "الصفحة الرئيسية", icon: Home },
    { to: "/templates", label: "إنشاء وثيقة", icon: Plus },
    { to: "/mail/incoming", label: "البريد الوارد", icon: Inbox, badge: true },
    { to: "/mail/outgoing", label: "البريد الصادر", icon: Send },
    { to: "/email", label: "البريد الإلكتروني", icon: Mail },
  ],
  [
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
  const gmailUnread = useGmailUnreadCount();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("ecolearchive:sidebar-collapsed") === "true"; } catch { return false; } });
  const toggleCollapsed = () => setCollapsed(current => { const next = !current; try { localStorage.setItem("ecolearchive:sidebar-collapsed", String(next)); } catch {} return next; });
  const [dark, setDark] = useState(false);
  const [q, setQ] = useState("");
  const [installedVersion, setInstalledVersion] = useState(packageInfo.version);
  const [emailVisited, setEmailVisited] = useState(path === "/email");
  const fr = settings.locale === "fr";
  const home = path === "/";

  useEffect(() => { setDark(localStorage.getItem("ui-theme") === "dark"); }, []);
  useEffect(() => { if (isDesktopRuntime()) void window.__TAURI_INTERNALS__!.invoke("installed_app_version").then((v: unknown) => { if (typeof v === "string") setInstalledVersion(v); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void checkDesktopUpdateNow();
    const timer = window.setInterval(() => void checkDesktopUpdateNow(), 15_000);
    const onResume = () => { if (document.visibilityState === "visible") void checkDesktopUpdateNow(); };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
    };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { if (path === "/email") setEmailVisited(true); }, [path]);

  const isActive = (to: string, label: string) =>
    to === "/" ? home : to === "/settings" ? path === "/settings" && label === "الإعدادات" : path.startsWith(to);

  return (
    <div className="flex min-h-screen w-full">
      {open && <div className="fixed inset-0 z-30 bg-foreground/40 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "no-print sidebar-skin fixed inset-y-0 start-0 z-40 flex w-64 flex-col text-sidebar-foreground transition-[transform,width] duration-300 md:sticky md:top-0 md:h-screen md:translate-x-0",
          collapsed ? "md:w-[76px]" : "md:w-64",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <button className="absolute end-3 top-3 md:hidden" onClick={() => setOpen(false)} aria-label="إغلاق"><X className="h-5 w-5" /></button>
        <button type="button" onClick={toggleCollapsed} className="absolute end-2 top-2 z-10 hidden rounded-lg p-2 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold md:grid" aria-label={collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"} title={collapsed ? "توسيع القائمة" : "طي القائمة"} aria-expanded={!collapsed}>
          {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
        <div className={cn("flex flex-col items-center text-center transition-all duration-300",collapsed ? "px-1 pb-4 pt-11 md:pt-10" : "px-4 pb-4 pt-6")}>
          <img src={bookLogo} alt="شعار الكتاب" width={83} height={83} className={cn("block h-[4.8rem] w-[4.8rem] object-contain drop-shadow-xl logo-3d-spin transition-[width,height] duration-300",collapsed ? "md:h-12 md:w-12" : "md:h-[5.2rem] md:w-[5.2rem]")} />
          <div className={cn("mt-2 font-display text-[16px] font-bold leading-snug",collapsed && "md:hidden")}>منظومة التسيير الإداري<br /><span className="gold-text">والأرشيف الرقمي</span></div>
          <div className={cn("gold-rule header-gold-shimmer mt-4 opacity-70",collapsed ? "w-10" : "w-3/4")} />
        </div>
        <nav aria-label="القائمة الجانبية" className="flex-1 overflow-y-auto pb-3">
          {NAV.map((g, gi) => (
            <div key={gi} className={cn("mt-2", gi > 0 && "border-t border-sidebar-border pt-3", collapsed ? "md:mx-2" : "mx-3")}>
              {gi > 0 && <div className={cn("mb-2 px-3 text-[11px] font-semibold tracking-wide text-sidebar-foreground/55",collapsed && "md:sr-only")}>{fr ? ["", "Gestion et archives", "Recherche", "Paramètres"][gi] : ["", "التسيير والأرشفة", "أدوات البحث", "الإعدادات"][gi]}</div>}
              {g.map((it) => {
                const active = isActive(it.to, it.label);
                return (
                  <Link
                    key={it.label}
                    to={it.to}
                    hash={it.hash}
                    title={collapsed ? (fr ? NAV_FR[it.to] ?? it.label : it.label) : undefined}
                    aria-label={fr ? NAV_FR[it.to] ?? it.label : it.label}
                    className={cn(
                      "nav-soft-glow relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-[background-color,color,box-shadow] hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold",
                      collapsed && "md:justify-center md:px-2",
                      active && "bg-sidebar-accent/80 font-bold text-sidebar-foreground shadow-[inset_3px_0_0_0_#d7af67]",
                    )}
                  >
                    <it.icon className="h-5 w-5 shrink-0" />
                    <span className={cn("min-w-0 flex-1",collapsed && "md:hidden")}>{fr ? NAV_FR[it.to] ?? it.label : it.label}</span>
                    {it.to === "/email" && gmailUnread > 0 && <span className={cn("grid h-6 min-w-6 place-items-center rounded-full bg-destructive", collapsed && "md:absolute md:-end-1 md:-top-1 md:h-4 md:min-w-4 md:px-1 md:text-[10px]")} px-1.5 text-xs font-bold text-destructive-foreground" aria-label={`${gmailUnread} رسائل Gmail غير مقروءة`}>{gmailUnread}</span>}
                    {it.badge && pendingIn > 0 && (
                      <span className={cn("notification-once grid h-6 min-w-6 place-items-center rounded-full bg-destructive", collapsed && "md:absolute md:-end-1 md:-top-1 md:h-4 md:min-w-4 md:px-1 md:text-[10px]")} px-1.5 text-xs font-bold text-destructive-foreground" key={pendingIn}>{pendingIn}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className={cn("mt-2 border-t border-sidebar-border pt-2",collapsed ? "md:mx-2" : "mx-3")}>
            <div title={`حول البرنامج — الإصدار ${installedVersion}`} className={cn("flex items-center gap-3 px-3 py-2.5 text-[13px] opacity-70",collapsed && "md:justify-center md:px-1")}><Info className="h-5 w-5 shrink-0" /><span className={cn(collapsed && "md:hidden")}>حول البرنامج — الإصدار {installedVersion}</span></div>
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
        <main className={cn("flex-1", home ? "p-0" : "p-4 md:p-6")}>
          <div hidden={path === "/email"}>{children}</div>
          {emailVisited && <div hidden={path !== "/email"}><EmailCenter /></div>}
        </main>
      </div>
    </div>
  );
}
