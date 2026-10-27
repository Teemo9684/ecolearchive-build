import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Download, Eye, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm, Empty, Pill } from "./bits";
import { EditDocDialog, PreviewDialog } from "./documents";
import type { ArchiveCategory, DocumentRecord } from "@/lib/db/types";
import { DOC_TYPE_LABEL, fmtDate, formatSize } from "@/lib/files";
import { downloadDocument, moveToBin, purgeDocument, restoreFromBin, setArchived } from "@/lib/services/documents";

export function DocumentTable({ docs, cats, mode = "active" }: { docs: DocumentRecord[]; cats: ArchiveCategory[]; mode?: "active" | "archived" | "bin" }) {
  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  const [edit, setEdit] = useState<DocumentRecord | null>(null);
  const [del, setDel] = useState<DocumentRecord | null>(null);
  const [purge, setPurge] = useState<DocumentRecord | null>(null);
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "—";
  if (!docs.length) return <Empty text="لا توجد وثائق مطابقة" />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-semibold">
              <th>العنوان</th><th>المرجع</th><th>التصنيف</th><th>السنة</th><th>النوع</th><th>التاريخ</th><th>الحجم</th><th className="text-end">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t transition-colors hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2">
                <td className="max-w-64">
                  <button className="truncate text-start font-semibold text-primary hover:underline" onClick={() => setPreview(d)}>{d.title}</button>
                  <div className="truncate text-xs text-muted-foreground">{d.fileName ?? "بدون ملف"}{d.tags.length > 0 && ` · ${d.tags.join("، ")}`}</div>
                </td>
                <td className="whitespace-nowrap text-xs">{d.reference || "—"}</td>
                <td className="text-xs">{catName(d.categoryId)}{d.subcategory && ` / ${d.subcategory}`}</td>
                <td className="whitespace-nowrap text-xs">{d.academicYear}</td>
                <td><Pill tone="primary">{DOC_TYPE_LABEL[d.docType] ?? d.docType}</Pill></td>
                <td className="whitespace-nowrap text-xs">{fmtDate(d.date)}</td>
                <td className="whitespace-nowrap text-xs">{formatSize(d.size)}</td>
                <td>
                  <div className="flex justify-end gap-0.5">
                    {mode !== "bin" ? (
                      <>
                        <Button size="icon" variant="ghost" title="معاينة" onClick={() => setPreview(d)}><Eye className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="تنزيل" onClick={() => downloadDocument(d).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="تعديل" onClick={() => setEdit(d)}><Pencil className="h-4 w-4" /></Button>
                        {d.status === "active" ? (
                          <Button size="icon" variant="ghost" title="أرشفة" onClick={() => setArchived(d, true).then(() => toast.success("تمت الأرشفة"))}><Archive className="h-4 w-4" /></Button>
                        ) : (
                          <Button size="icon" variant="ghost" title="استرجاع من الأرشيف" onClick={() => setArchived(d, false).then(() => toast.success("تم الاسترجاع"))}><ArchiveRestore className="h-4 w-4" /></Button>
                        )}
                        <Button size="icon" variant="ghost" title="نقل إلى سلة المحذوفات" onClick={() => setDel(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => restoreFromBin(d).then(() => toast.success("تمت استعادة الوثيقة"))}><RotateCcw className="h-3.5 w-3.5" />استعادة</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setPurge(d)}>حذف نهائي</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PreviewDialog doc={preview} onClose={() => setPreview(null)} />
      <EditDocDialog doc={edit} onClose={() => setEdit(null)} />
      <Confirm open={!!del} onOpenChange={(v) => !v && setDel(null)} title="نقل إلى سلة المحذوفات؟"
        description={`سيتم نقل "${del?.title}" إلى سلة المحذوفات ويمكن استعادتها لاحقا.`} confirmLabel="نقل إلى السلة" destructive
        onConfirm={() => del && moveToBin(del).then(() => { toast.success("نقلت الوثيقة إلى سلة المحذوفات"); setDel(null); })} />
      <Confirm open={!!purge} onOpenChange={(v) => !v && setPurge(null)} title="حذف نهائي؟"
        description={`سيتم حذف "${purge?.title}" ونسخته المخزنة في التطبيق نهائيا. لن يمس الملف الأصلي على الحاسوب. لا يمكن التراجع.`} confirmLabel="حذف نهائي" destructive
        onConfirm={() => purge && purgeDocument(purge).then(() => { toast.success("تم الحذف النهائي"); setPurge(null); })} />
    </>
  );
}
