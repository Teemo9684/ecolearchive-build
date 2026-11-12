import "@fontsource/aref-ruqaa/700.css";
import { useIncomingAlerts } from "@/lib/useIncomingAlerts";
import { useGmailUnreadCount } from "@/lib/gmail-unread";
import { checkDesktopUpdateNow, useAvailableDesktopUpdate } from "@/lib/desktop-update-alert";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell, ChevronDown, ChevronLeft, Search, FilePlus2, Send, Mail, FileText, Inbox, UserRound, FolderOpen,
  Users, BarChart3, BarChart2, Zap, FileSpreadsheet, Printer, Folder, CloudUpload,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Empty } from "@/components/app/bits";
import { useCollection, useSettings } from "@/lib/db/hooks";
import type { Correspondence, DocumentRecord, Staff } from "@/lib/db/types";
import hero from "@/assets/hero-school.jpg";
import approvedLogo from "@/assets/school-logo.png";
import bookLogo from "@/assets/logo-book.png";
import { LovableSchoolLogo } from "@/components/app/LovableSchoolLogo";
import { cn } from "@/lib/utils";
import { isDesktopRuntime } from "@/lib/db/desktop";
import packageInfo from "../../package.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الصفحة الرئيسية — منظومة التسيير الإداري والأرشيف الرقمي" },
      { name: "description", content: "لوحة تحكم المدرسة الابتدائية العربي التبسي: الوثائق والمراسلات والمستخدمون." },
      { property: "og:title", content: "منظومة التسيير الإداري والأرشيف الرقمي" },
      { property: "og:description", content: "متابعة الأرشيف والبريد والعمال والمهام اليومية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const TONES = ["tone-blue", "tone-green", "tone-pink", "tone-orange", "tone-gray"];
const CHART_COLORS = ["oklch(0.62 0.17 255)", "oklch(0.68 0.15 160)", "oklch(0.68 0.18 0)", "oklch(0.8 0.15 80)", "oklch(0.7 0.04 60)"];

function Dashboard() {
  const settings = useSettings();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const availableUpdate = useAvailableDesktopUpdate();
  const [updateBusy,setUpdateBusy]=useState(false);
  const [downloadProgress,setDownloadProgress]=useState<{downloaded:number;total:number|null;phase:string}|null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const docs = useCollection<DocumentRecord>("documents");
  const corr = useCollection<Correspondence>("correspondences");
  const employees = useCollection<Staff>("employees");
  const teachers = useCollection<Staff>("teachers");

  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (alertsOpen) void checkDesktopUpdateNow();
  }, [alertsOpen]);
  useEffect(() => {
    if (!infoOpen && !alertsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setInfoOpen(false); setAlertsOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [infoOpen, alertsOpen]);

  const installFromBell=async()=>{
    if(!availableUpdate||updateBusy||!isDesktopRuntime())return;
    if(!window.confirm(`تثبيت التحديث ${availableUpdate}؟ احفظ عملك أولًا، وسيُعاد تشغيل البرنامج.`))return;
    setUpdateBusy(true);setDownloadProgress({downloaded:0,total:null,phase:"checking"});
    const timer=window.setInterval(()=>{window.__TAURI_INTERNALS__!.invoke("get_update_download_progress").then(v=>setDownloadProgress(v as {downloaded:number;total:number|null;phase:string})).catch(()=>{});},400);
    try{await window.__TAURI_INTERNALS__!.invoke("install_desktop_update");}
    catch(e){window.alert("تعذر تثبيت التحديث: "+String(e));setUpdateBusy(false);}
    finally{window.clearInterval(timer);}
  };

  const liveDocs = docs.data.filter((d) => !d.deletedAt);
  const liveCorr = corr.data.filter((c) => !c.deletedAt);
  const inCount = liveCorr.filter((c) => c.direction === "in").length;
  const outCount = liveCorr.filter((c) => c.direction === "out").length;
  const staffCount = employees.data.filter((s) => !s.deletedAt).length + teachers.data.filter((s) => !s.deletedAt).length;
  const pendingIn = useIncomingAlerts(corr.data, "/");
  const gmailUnread = useGmailUnreadCount();

  const recent = [...liveDocs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const corrById = new Map(liveCorr.map((c) => [c.id, c]));
  const docTag = (d: DocumentRecord) => {
    if (d.relatedType === "correspondence") {
      const c = d.relatedId ? corrById.get(d.relatedId) : undefined;
      return c?.direction === "in" ? { label: "وارد", tone: "tone-blue" } : { label: "صادر", tone: "tone-green" };
    }
    if (d.relatedType === "student") return { label: "شهادات", tone: "tone-pink" };
    if (d.relatedType === "teacher" || d.relatedType === "employee" || d.relatedType === "staffRecord") return { label: "ملف مهني", tone: "tone-violet" };
    return { label: "أرشيف", tone: "tone-gold" };
  };

  const month = (now ?? new Date()).toISOString().slice(0, 7);
  const mCorr = liveCorr.filter((c) => c.date.startsWith(month));
  const mDocs = liveDocs.filter((d) => d.date.startsWith(month) && d.relatedType !== "correspondence");
  const dist = [
    { name: "البريد الوارد", value: mCorr.filter((c) => c.direction === "in").length },
    { name: "البريد الصادر", value: mCorr.filter((c) => c.direction === "out").length },
    { name: "شهادات مدرسية", value: mDocs.filter((d) => d.relatedType === "student").length },
    { name: "مراسلات", value: mDocs.filter((d) => d.relatedType && d.relatedType !== "student").length },
    { name: "أخرى", value: mDocs.filter((d) => !d.relatedType).length },
  ];
  const distTotal = dist.reduce((s, d) => s + d.value, 0);

  const tasks = liveCorr
    .filter((c) => c.status === "pending")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  const taskTone = (c: Correspondence) => (c.priority === "very_urgent" ? "tone-pink" : c.priority === "urgent" ? "tone-gold" : c.direction === "in" ? "tone-blue" : "tone-green");

  const tickerItems: { text: string; to: string }[] = [
    ...(availableUpdate ? [{ text: `تحديث جديد للمنظومة: الإصدار ${availableUpdate}`, to: "/" }] : []),
    ...(pendingIn > 0 ? [{ text: `${pendingIn} مراسلات واردة جديدة تستحق المتابعة`, to: "/mail/incoming" }] : []),
    ...(gmailUnread > 0 ? [{ text: `${gmailUnread} رسائل بريد إلكتروني غير مقروءة`, to: "/email" }] : []),
    ...(tasks.length > 0 ? [{ text: `${tasks.length} مراسلات معلقة من أحدث المهام`, to: "/mail/incoming" }] : []),
    ...(liveDocs.length > 0 ? [{ text: `الأرشيف الرقمي يحتوي على ${liveDocs.length} وثيقة محفوظة`, to: "/archive" }] : []),
    { text: `السنة الدراسية ${settings.currentYear}`, to: "/" },
  ];

  const dateStr = now ? new Intl.DateTimeFormat("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now) : "";
  const timeStr = now ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(now) : "";

  return (
    <div>
      {(infoOpen || alertsOpen) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) { setInfoOpen(false); setAlertsOpen(false); } }}>
          <section role="dialog" aria-modal="true" aria-label={infoOpen ? "معلومات المدرسة والبرنامج" : "التنبيهات"} className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{infoOpen ? "معلومات المدرسة والمنظومة" : "مركز التنبيهات"}</h2>
              <button aria-label="إغلاق" onClick={() => { setInfoOpen(false); setAlertsOpen(false); }} className="rounded-lg p-2 hover:bg-muted">✕</button>
            </div>
            {infoOpen ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-muted p-4">
                  <h3 className="text-lg font-bold">{settings.schoolName}</h3>
                  <p className="text-sm text-muted-foreground">{settings.city} · السنة الدراسية {settings.currentYear}</p>
                  <p className="mt-2 text-sm">منظومة التسيير الإداري والأرشيف الرقمي — الإصدار {packageInfo.version}</p>
                </div>
                <h3 className="font-bold">إحصائيات المؤسسة</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["الوثائق المؤرشفة", liveDocs.length], ["البريد الوارد", inCount], ["البريد الصادر", outCount],
                    ["ملفات العمال", employees.data.filter(x => !x.deletedAt).length],
                    ["العمال التربويون", teachers.data.filter(x => !x.deletedAt).length],
                    ["المراسلات قيد المعالجة", liveCorr.filter(x => x.status === "pending").length]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-background p-3 text-center">
                      <div className="text-2xl font-bold text-primary">{value}</div><div className="text-xs text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">تعرض الإحصائيات البيانات المسجلة في المنظومة، وتتحدث عند تحديث السجلات.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableUpdate && <div className="rounded-xl border border-gold/50 bg-muted p-4">
                  <div className="font-bold">يتوفر تحديث جديد: {availableUpdate}</div>
                  <p className="mt-1 text-sm">تستطيع تثبيت التحديث مباشرة من مركز التنبيهات.</p>
                  <button disabled={updateBusy} onClick={()=>void installFromBell()} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">{updateBusy?"جارٍ تثبيت التحديث…":"تثبيت التحديث الآن"}</button>{updateBusy&&downloadProgress&&<p className="mt-2 text-xs" role="status">التنزيل: {downloadProgress.total?Math.round(100*downloadProgress.downloaded/downloadProgress.total)+"%":"جارٍ التحضير"} — {downloadProgress.phase}</p>}
                </div>}
                {pendingIn > 0 && <div className="rounded-xl border p-4">
                  <div className="font-bold">مراسلات واردة تنتظر المعالجة: {pendingIn}</div>
                  <button onClick={() => { setAlertsOpen(false); navigate({ to: "/mail/incoming" }); }} className="mt-2 text-sm text-primary underline">فتح البريد الوارد</button>
                </div>}
                {gmailUnread > 0 && <div className="rounded-xl border p-4"><div className="font-bold">رسائل Gmail غير مقروءة: {gmailUnread}</div><button onClick={() => { setAlertsOpen(false); navigate({ to: "/email" }); }} className="mt-2 text-sm text-primary underline">فتح البريد الإلكتروني</button></div>}
                {!availableUpdate && pendingIn === 0 && gmailUnread === 0 && <p className="rounded-xl bg-muted p-4 text-sm">لا توجد تنبيهات جديدة.</p>}
              </div>
            )}
          </section>
        </div>
      )}
      {/* Banner */}
      <section className="relative overflow-hidden bg-sidebar">
        <img src={hero} alt="" width={1920} height={640} className="absolute inset-0 h-full w-full scale-105 object-cover" style={{ transform: "scaleX(-1)" }} />
        <div className="absolute inset-0 bg-gradient-to-l from-sidebar/40 via-sidebar/75 to-sidebar/30" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-sidebar/80 to-transparent" />
        <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-5 pb-12 pt-6 md:px-8 md:pt-8 lg:min-h-[340px] lg:flex-row lg:items-center lg:gap-7 lg:px-10 lg:pb-[88px] lg:pt-8">
          <div className="hidden shrink-0 animate-fade-up lg:flex lg:w-36 lg:items-center lg:justify-center xl:w-40">
            <LovableSchoolLogo logo={approvedLogo} className="h-36 w-36 xl:h-40 xl:w-40" />
          </div>
          <div className="hero-ink min-w-0 flex-1 animate-fade-up text-center [animation-delay:120ms]">
            <h1 className="text-2xl font-bold leading-relaxed drop-shadow-lg md:text-3xl xl:text-4xl">{settings.schoolName}</h1>
            <div className="mt-2 flex items-center justify-center gap-3 text-base opacity-90 md:text-lg xl:text-xl">
              <span className="h-px w-12 bg-gradient-to-l from-gold to-transparent md:w-20" />{settings.city}<span className="h-px w-12 bg-gradient-to-r from-gold to-transparent md:w-20" />
            </div>
            <h2 className="school-ruqaa-title gold-text relative z-10 mx-auto mt-2 max-w-[820px] text-3xl leading-[1.5] md:text-4xl md:leading-[1.5] xl:text-4xl">منظومة التسيير الإداري والأرشيف الرقمي</h2>
            
          </div>
          <div className="hero-ink order-first mx-auto flex w-full max-w-lg animate-fade-up flex-col gap-2.5 lg:order-last lg:mx-0 lg:w-[300px] lg:max-w-[300px] lg:shrink-0 xl:w-80 xl:max-w-80">
            <div className="flex w-full items-center gap-2">
              <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); navigate({ to: "/search", search: { q } }); }}>
                <div className="relative">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث سريع عن وثيقة، رقم، تلميذ ..."
                    className="glass h-11 w-full rounded-full ps-4 pe-10 text-sm text-inherit outline-none transition placeholder:text-sidebar-foreground/70 focus:ring-2 focus:ring-gold" />
                  <Search className="pointer-events-none absolute end-3 top-1/2 h-5 w-5 -translate-y-1/2 opacity-80" />
                </div>
              </form>
              <button type="button" onClick={() => setAlertsOpen(true)} aria-label="التنبيهات" className="glass relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:ring-2 hover:ring-gold/60">
                <Bell className="h-5 w-5" />
                {(pendingIn > 0 || gmailUnread > 0 || availableUpdate) && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground ring-2 ring-sidebar">{pendingIn + gmailUnread + (availableUpdate ? 1 : 0)}</span>}
              </button>
              <button type="button" onClick={() => setInfoOpen(true)} className="glass hidden h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold transition hover:ring-2 hover:ring-gold/60 sm:flex">
                <UserRound className="h-5 w-5" />المديرة<ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className="glass flex min-h-[70px] items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs leading-relaxed opacity-80">{greeting(now)}، السيدة المديرة سلطاني عين الحياة</div>
                <div className="truncate text-sm font-semibold">{dateStr}</div>
              </div>
              <div className="gold-text font-sans text-3xl font-bold tabular-nums">{timeStr}</div>
            </div>
            <div className="glass flex min-h-10 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success" />
              <span>السنة الدراسية {settings.currentYear}</span>
            </div>
          </div>
        </div>
        {/* Glass ticker is embedded inside the hero, flush with its lower edge. */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex h-10 items-center bg-white/[0.045] text-white shadow-[0_-5px_18px_rgba(2,13,33,.08)] backdrop-blur-[22px]">
          <div className="relative z-20 flex h-full shrink-0 items-center gap-2 px-3 text-xs font-semibold text-amber-200 md:px-5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
            <span>آخر المستجدات</span>
          </div>
          <div dir="rtl" className="ecole-ticker-viewport min-w-0 flex-1 overflow-hidden" aria-label="مستجدات المنظومة">
            <div dir="rtl" className="ecole-ticker-track flex w-max items-center">
              {tickerItems.map((item,i) => <div key={i} className="flex shrink-0 items-center">
                <button type="button" className="whitespace-nowrap px-7 text-xs font-medium text-slate-50 transition-colors hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300" onClick={() => item.to === "/" && availableUpdate && i===0 ? setAlertsOpen(true) : navigate({to:item.to as "/"})}>{item.text}</button>
                <img src={bookLogo} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain" />
              </div>)}
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-0 space-y-5 rounded-t-3xl bg-background p-4 md:p-6 [&>*]:animate-fade-up [&>*:nth-child(2)]:[animation-delay:80ms] [&>*:nth-child(3)]:[animation-delay:160ms] [&>*:nth-child(4)]:[animation-delay:240ms]">
        {/* Quick actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Action to="/templates" title="إنشاء وثيقة" sub="نماذج جاهزة للاستعمال" icon={FileText} tone="tone-gold" />
          <Action to="/email" title="البريد الإلكتروني" sub="إدارة بريد Gmail المدرسي" icon={Mail} tone="tone-pink" />
          <Action to="/templates" kind="bordereau" title="جدول إرسال" sub="إنشاء جدول إرسال" icon={Send} tone="tone-green" />
          <Action to="/templates" kind="correspondence" title="مراسلة جديدة" sub="إنشاء مراسلة إدارية" icon={FilePlus2} tone="tone-blue" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat to="/employees" title="ملفات العمال" value={staffCount} sub="ملف مهني" icon={Users} tone="tone-violet" />
          <Stat to="/archive" title="الوثائق المؤرشفة" value={liveDocs.length} sub="مجموع الوثائق" icon={FolderOpen} tone="tone-pink" />
          <Stat to="/mail/outgoing" title="البريد الصادر" value={outCount} sub="منذ بداية السنة" icon={UserRound} tone="tone-green" />
          <Stat to="/mail/incoming" title="البريد الوارد" value={inCount} sub="منذ بداية السنة" icon={Inbox} tone="tone-blue" />
        </div>

        {/* Panels */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel lift p-5">
            <h3 className="mb-4 flex items-center gap-2 border-b pb-3 text-lg font-bold"><Bell className="h-5 w-5 text-primary" />المهام والتنبيهات</h3>
            {tasks.length === 0 ? <Empty text="لا توجد مهام معلقة" /> : (
              <ul className="space-y-2">
                {tasks.map((c) => (
                  <li key={c.id}>
                    <Link to={c.direction === "in" ? "/mail/incoming" : "/mail/outgoing"} className="flex items-start gap-3 rounded-xl border bg-background/50 px-3 py-2.5 transition hover:-translate-x-1 hover:border-gold/50 hover:bg-muted">
                      <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full tone-dot", taskTone(c))} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{c.subject}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.direction === "in" ? "من" : "إلى"} {c.party}</div>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">{new Intl.DateTimeFormat("ar-DZ", { day: "numeric", month: "long" }).format(new Date(c.date))}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel lift p-5">
            <h3 className="mb-4 flex items-center gap-2 border-b pb-3 text-lg font-bold"><BarChart3 className="h-5 w-5 text-primary" />توزيع الوثائق هذا الشهر</h3>
            <div className="flex items-center gap-4">
              <ul className="flex-1 space-y-3 text-sm">
                {dist.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className={cn("h-3.5 w-3.5 rounded tone-dot", TONES[i])} />
                    <span className="flex-1">{d.name}</span>
                    <span className="font-bold">{d.value}</span>
                  </li>
                ))}
              </ul>
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={distTotal ? dist : [{ name: "-", value: 1 }]} dataKey="value" innerRadius={50} outerRadius={80} stroke="none" startAngle={90} endAngle={-270}>
                      {(distTotal ? dist : [0]).map((_, i) => <Cell key={i} fill={distTotal ? CHART_COLORS[i] : "var(--color-muted)"} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div><div className="text-3xl font-extrabold leading-none">{distTotal}</div><div className="text-sm font-bold">وثيقة</div></div>
                </div>
              </div>
            </div>
          </section>

          <section className="panel lift p-5">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <h3 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5 text-primary" />آخر الوثائق</h3>
              <Link to="/archive" className="rounded-md bg-muted px-3 py-1 text-xs hover:bg-accent">عرض الكل</Link>
            </div>
            {recent.length === 0 ? <Empty /> : (
              <ul className="divide-y">
                {recent.map((d) => { const t = docTag(d); return (
                  <li key={d.id} className="flex items-center gap-3 py-2">
                    <FileText className={cn("h-6 w-6 shrink-0", t.tone === "tone-pink" ? "tone-text tone-pink" : "text-foreground")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{d.date}</div>
                    </div>
                    <span className={cn("rounded-md px-3 py-1 text-xs font-semibold tone-chip", t.tone)}>{t.label}</span>
                  </li>
                ); })}
              </ul>
            )}
          </section>
        </div>

        {/* Quick tools */}
        <div className="panel flex flex-wrap items-center gap-3 p-3">
          <div className="flex items-center gap-2 px-2 font-bold"><Zap className="h-5 w-5 tone-text tone-gold" />أدوات سريعة</div>
          <Tool to="/search" label="بحث متقدم" icon={Search} tone="tone-blue" />
          <Tool to="/reports" label="تصدير إلى Excel" icon={FileSpreadsheet} tone="tone-green" />
          <Tool to="/archive" label="طباعة وثائق" icon={Printer} tone="tone-violet" />
          <Tool to="/archive" label="إنشاء مجلد" icon={Folder} tone="tone-gold" />
          <Tool to="/settings" label="نسخ احتياطي" icon={CloudUpload} tone="tone-blue" />
        </div>
      </div>
    </div>
  );
}

function greeting(d: Date | null) {
  const h = d?.getHours() ?? 9;
  return h < 12 ? "صباح الخير" : h < 18 ? "طاب يومك" : "مساء الخير";
}

function Action({ to, kind, title, sub, icon: Icon, tone }: { to: string; kind?: "bordereau"|"correspondence"; title: string; sub: string; icon: typeof Send; tone: string }) {
  return (
    <Link to={to} search={kind ? {kind} : undefined} title={sub} className={cn("panel lift group relative flex items-center gap-4 overflow-hidden p-4", tone)}>
      <div className="absolute -start-10 -top-10 h-28 w-28 rounded-full opacity-10 tone-dot transition-transform duration-500 group-hover:scale-150" />
      <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-lg tone-solid transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105"><Icon className="h-7 w-7" /></div>
      <div className="relative min-w-0 flex-1">
        <div className="text-base font-bold md:text-lg">{title}</div>
        <div className="text-sm text-muted-foreground">{sub}</div>

      </div>
      <div className="relative grid h-8 w-8 place-items-center rounded-full bg-muted transition group-hover:-translate-x-1 tone-chip"><ChevronLeft className="h-4 w-4" /></div>
    </Link>
  );
}

function Stat({ to, title, value, sub, icon: Icon, tone }: { to: string; title: string; value: number; sub: string; icon: typeof Send; tone: string }) {
  return (
    <Link to={to} title={sub} className={cn("lift group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-5 tone-soft", tone)}>
      <div className="absolute inset-y-0 start-0 w-1.5 tone-dot" />
      <Icon className="absolute -bottom-4 -end-3 h-24 w-24 opacity-[0.07] tone-text transition-transform duration-500 group-hover:scale-110" />
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl tone-chip ring-1 ring-current/10"><Icon className="h-8 w-8" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-muted-foreground">{title}</div>
        <div className="font-sans text-4xl font-extrabold leading-tight tabular-nums tone-text">{value}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground"><BarChart2 className="h-3.5 w-3.5" />{sub}</div>
        
      </div>
    </Link>
  );
}

function Tool({ to, label, icon: Icon, tone }: { to: string; label: string; icon: typeof Send; tone: string }) {
  return (
    <Link to={to} className={cn("lift flex min-w-36 flex-1 items-center justify-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-semibold tone-soft", tone)}>
      <Icon className={cn("h-5 w-5 tone-text", tone)} />{label}
    </Link>
  );
}
