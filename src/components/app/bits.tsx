import { type ReactNode } from "react";
import { Construction, Inbox, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-foreground md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ text = "لا توجد بيانات" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
      <Inbox className="h-8 w-8 opacity-50" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> جار التحميل...
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="panel border-destructive/40 p-4 text-sm text-destructive">تعذر تحميل البيانات: {error}</div>;
}

export function Field({ label, error, children, className }: { label: string; error?: string | undefined; children: ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function Confirm({
  open, onOpenChange, title, description, confirmLabel = "تأكيد", destructive, onConfirm,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string;
  confirmLabel?: string; destructive?: boolean; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-start">
          <AlertDialogAction
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "gold" | "success" | "warning" | "destructive" | "primary" }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    gold: "bg-gold/20 text-gold-foreground dark:text-gold",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    primary: "bg-primary/10 text-primary",
  };
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

export function NotImplemented({ title, planned, note }: { title: string; planned: string[]; note?: ReactNode }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="panel max-w-3xl p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold/20 text-gold-foreground dark:text-gold"><Construction className="h-5 w-5" /></div>
          <div>
            <div className="font-bold">هذه الوحدة غير منجزة بعد</div>
            <div className="text-sm text-muted-foreground">نموذج البيانات جاهز في طبقة التخزين، وستضاف الواجهة في مرحلة لاحقة. لا توجد وظائف وهمية هنا.</div>
          </div>
        </div>
        <div className="mt-5 text-sm font-semibold">الوظائف المخططة:</div>
        <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          {planned.map((p) => <li key={p} className="flex gap-2"><span className="text-gold">◆</span>{p}</li>)}
        </ul>
        {note && <div className="mt-5 rounded-md bg-muted p-3 text-sm">{note}</div>}
      </div>
    </div>
  );
}
