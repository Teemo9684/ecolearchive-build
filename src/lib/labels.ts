import type { CorrStatus, Priority, StaffRecordType, StaffStatus } from "./db/types";

export const PRIORITY: Record<Priority, string> = { normal: "عادي", urgent: "مستعجل", very_urgent: "مستعجل جدا" };
export const CORR_STATUS: Record<CorrStatus, string> = { pending: "قيد المعالجة", processed: "تمت المعالجة", archived: "مؤرشف" };
export const STAFF_STATUS: Record<StaffStatus, string> = { active: "في الخدمة", leave: "في عطلة", transferred: "محول", retired: "متقاعد" };
export const RECORD_TYPE: Record<StaffRecordType, string> = {
  performance: "المردودية", evaluation: "التنقيط", absence: "الغيابات", leave: "العطل", training: "التكوين", decision: "القرارات",
};

/** Optional French localization scaffold (navigation). Arabic RTL remains the default. */
export const NAV_FR: Record<string, string> = {
  "/": "Tableau de bord", "/archive": "Archive numérique", "/mail/incoming": "Courrier arrivé", "/mail/outgoing": "Courrier départ",
  "/teachers": "Enseignants", "/employees": "Personnel", "/admin-files": "Dossiers administratifs", "/students": "Élèves",
  "/inventory": "Finances et inventaire", "/templates": "Création de documents", "/reports": "Rapports", "/search": "Recherche", "/settings": "Paramètres",
};
