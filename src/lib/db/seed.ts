// Synthetic demonstration data only — no real school records.
import { repo, uid, nowIso } from "./idb";
import { sha256 } from "../files";
import type {
  AcademicYear, ArchiveCategory, Correspondence, DocumentFile, DocumentRecord, Settings, Staff, StaffRecord,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  id: "main",
  schoolName: "المدرسة الابتدائية العربي التبسي",
  city: "خنشلة",
  wilaya: "ولاية خنشلة",
  directorate: "مديرية التربية لولاية خنشلة",
  headerLine: "الجمهورية الجزائرية الديمقراطية الشعبية",
  currentYear: "2026-2027",
  prefixIn: "و",
  prefixOut: "ص",
  locale: "ar",
};

const CATS = [
  "المراسلات الإدارية", "المناشير والتعليمات", "القرارات", "التقارير", "المحاضر",
  "جداول الإرسال", "الشهادات والاستمارات", "وثائق المؤسسة", "ملفات المستخدمين", "شؤون التلاميذ", "المالية والجرد",
];

let seeding: Promise<void> | null = null;
export function ensureSeed(): Promise<void> {
  if (!seeding) seeding = doSeed();
  return seeding;
}

async function doSeed() {
  const existing = await repo<Settings>("settings").get("main");
  if (existing) return;
  const t = nowIso();
  const years: AcademicYear[] = ["2024-2025", "2025-2026", "2026-2027"].map((l) => ({ id: l, label: l, current: l === "2026-2027" }));
  const cats: ArchiveCategory[] = CATS.map((name, i) => ({ id: `cat-${i + 1}`, name, parentId: null }));

  const mk = (kind: Staff["kind"], fullName: string, employeeId: string, recruitmentDate: string, grade: string, assignment: string, status: Staff["status"] = "active"): Staff =>
    ({ id: uid(), kind, fullName, employeeId, recruitmentDate, grade, assignment, status, phone: "", notes: "", deletedAt: null, createdAt: t });
  const teachers = [
    mk("teacher", "سمير بن عيسى", "T-1001", "2008-09-15", "أستاذ مكون", "السنة الخامسة أ"),
    mk("teacher", "نادية بوزيدي", "T-1002", "2011-09-10", "أستاذ رئيسي", "السنة الرابعة أ"),
    mk("teacher", "كريم حمادي", "T-1003", "2015-10-01", "أستاذ المدرسة الابتدائية", "السنة الثالثة ب"),
    mk("teacher", "ليلى مسعودي", "T-1004", "2018-09-05", "أستاذ المدرسة الابتدائية", "السنة الثانية أ", "leave"),
    mk("teacher", "عادل شريف", "T-1005", "2019-09-08", "أستاذ المدرسة الابتدائية", "السنة الأولى أ"),
    mk("teacher", "هدى زروال", "T-1006", "2021-09-12", "أستاذ المدرسة الابتدائية", "القسم التحضيري"),
    mk("teacher", "رضا بلقاسمي", "T-1007", "2013-09-01", "أستاذ رئيسي", "اللغة الفرنسية"),
    mk("teacher", "مريم عمراني", "T-1008", "2022-10-03", "أستاذ متعاقد", "اللغة الإنجليزية"),
  ];
  const employees = [
    mk("employee", "عبد الحق منصوري", "E-2001", "2010-01-10", "عون إدارة", "الأمانة"),
    mk("employee", "فاطمة لعلاوي", "E-2002", "2014-03-01", "عامل مهني", "النظافة"),
    mk("employee", "يوسف دراجي", "E-2003", "2016-05-20", "عون أمن ووقاية", "الحراسة"),
    mk("employee", "سعاد بن علي", "E-2004", "2012-02-14", "عامل مهني", "المطعم المدرسي"),
    mk("employee", "مراد قاسمي", "E-2005", "2009-11-03", "عامل مهني", "الصيانة", "transferred"),
  ];

  const recs: StaffRecord[] = [];
  const addRec = (s: Staff, type: StaffRecord["type"], period: string, date: string, score: string, details: string, dateEnd = "") =>
    recs.push({ id: uid(), staffId: s.id, staffKind: s.kind, type, period, date, dateEnd, score, details, createdAt: t });
  teachers.slice(0, 4).forEach((s, i) => {
    addRec(s, "evaluation", "2025-2026", "2026-05-20", String(16 + (i % 3)), "تنقيط سنوي من طرف المفتش");
    addRec(s, "performance", "الفصل الأول 2025-2026", "2025-12-18", String(36 + i), "منحة المردودية الفصلية");
  });
  addRec(teachers[3]!, "leave", "2026-2027", "2026-10-01", "", "عطلة أمومة", "2026-12-31");
  addRec(teachers[2]!, "absence", "2026-2027", "2026-10-12", "", "غياب مبرر بشهادة طبية", "2026-10-13");
  addRec(teachers[0]!, "training", "2025-2026", "2026-02-10", "", "ملتقى تكويني حول المقاربة بالكفاءات");
  addRec(employees[0]!, "evaluation", "2025-2026", "2026-06-10", "15", "تنقيط سنوي");

  const corr: Correspondence[] = [];
  const addC = (direction: "in" | "out", n: number, subject: string, party: string, date: string, priority: Correspondence["priority"], status: Correspondence["status"]) =>
    corr.push({ id: uid(), direction, reference: `${direction === "in" ? "و" : "ص"}/${String(n).padStart(3, "0")}/2026`, subject, party, date, category: "المراسلات الإدارية", academicYear: "2026-2027", priority, status, notes: "", deletedAt: null, createdAt: t });
  addC("in", 1, "مذكرة حول الدخول المدرسي", "مديرية التربية لولاية خنشلة", "2026-09-02", "urgent", "processed");
  addC("in", 2, "طلب إحصاء التلاميذ الجدد", "مفتشية التعليم الابتدائي", "2026-09-14", "very_urgent", "pending");
  addC("in", 3, "دعوة لاجتماع المديرين", "مفتشية التعليم الابتدائي", "2026-09-28", "normal", "processed");
  addC("in", 4, "إرسالية حول التكوين أثناء الخدمة", "مديرية التربية لولاية خنشلة", "2026-10-06", "normal", "pending");
  addC("in", 5, "طلب صيانة المطعم المدرسي", "بلدية خنشلة", "2026-10-11", "urgent", "pending");
  addC("out", 1, "إرسال محضر الدخول المدرسي", "مفتشية التعليم الابتدائي", "2026-09-07", "normal", "archived");
  addC("out", 2, "إحصاء التلاميذ حسب الجنس", "مديرية التربية لولاية خنشلة", "2026-09-20", "urgent", "processed");
  addC("out", 3, "طلب تعويض أستاذ في عطلة", "مديرية التربية لولاية خنشلة", "2026-10-02", "very_urgent", "pending");
  addC("out", 4, "قائمة الأساتذة والأقسام", "مفتشية التعليم الابتدائي", "2026-10-08", "normal", "processed");

  // Small synthetic text files so preview/download/hash can be exercised.
  const docs: DocumentRecord[] = [];
  const files: DocumentFile[] = [];
  const addDoc = async (title: string, catIdx: number, date: string, year: string, tags: string[], related?: Staff) => {
    const body = `${title}\n\nوثيقة تجريبية لأغراض العرض فقط.\n${DEFAULT_SETTINGS.schoolName} - ${year}`;
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const fid = uid();
    const hash = (await sha256(blob)) ?? null;
    const name = `${title}.txt`;
    files.push({ id: fid, blob, hash: hash ?? "", name, type: blob.type });
    docs.push({
      id: uid(), title, reference: `أرش/${docs.length + 1}/${year.slice(5)}`, categoryId: `cat-${catIdx}`, subcategory: "",
      academicYear: year, docType: "other", tags, description: "وثيقة تجريبية", date,
      relatedType: related ? related.kind : null, relatedId: related?.id ?? null,
      fileId: fid, fileName: name, mimeType: blob.type, size: blob.size, hash,
      status: "active", deletedAt: null, createdAt: t, updatedAt: t,
    });
  };
  await addDoc("منشور وزاري حول تنظيم السنة الدراسية", 2, "2026-08-25", "2026-2027", ["منشور", "تنظيم"]);
  await addDoc("قرار تعيين المعلمين على الأقسام", 3, "2026-09-03", "2026-2027", ["قرار", "تعيين"]);
  await addDoc("محضر مجلس المعلمين الأول", 5, "2026-09-10", "2026-2027", ["محضر", "مجلس"]);
  await addDoc("التقرير السنوي للمؤسسة", 4, "2026-06-30", "2025-2026", ["تقرير"]);
  await addDoc("جدول إرسال وثائق الدخول المدرسي", 6, "2026-09-08", "2026-2027", ["إرسال"]);
  await addDoc("محضر تنصيب أستاذ", 9, "2015-10-01", "2025-2026", ["تنصيب"], teachers[2]!);
  await addDoc("بطاقة تنقيط سنوية", 9, "2026-05-20", "2025-2026", ["تنقيط"], teachers[0]!);
  await addDoc("سجل الجرد السنوي", 11, "2026-06-15", "2025-2026", ["جرد"]);

  await repo("academicYears").putMany(years);
  await repo("archiveCategories").putMany(cats);
  await repo("teachers").putMany(teachers);
  await repo("employees").putMany(employees);
  await repo("staffRecords").putMany(recs);
  await repo("correspondences").putMany(corr);
  await repo("documentFiles").putMany(files);
  await repo("documents").putMany(docs);
  await repo("settings").put(DEFAULT_SETTINGS);
}
