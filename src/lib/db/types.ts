// Domain models. Kept storage-agnostic so they can map 1:1 to SQLite tables later.
export type ID = string;

export interface AcademicYear { id: ID; label: string; current: boolean }
export interface ArchiveCategory { id: ID; name: string; parentId: ID | null }

export type RelatedType = "teacher" | "employee" | "correspondence" | "student" | "staffRecord";

export interface DocumentRecord {
  id: ID;
  title: string;
  reference: string;
  categoryId: ID;
  subcategory: string;
  academicYear: string;
  docType: string; // pdf | word | excel | image | other
  tags: string[];
  description: string;
  date: string;
  relatedType: RelatedType | null;
  relatedId: ID | null;
  fileId: ID | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  hash: string | null;
  status: "active" | "archived";
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Binary content of an imported file. Originals on disk are never touched; this is a copy. */
export interface DocumentFile { id: ID; blob: Blob; hash: string; name: string; type: string }

export type Priority = "normal" | "urgent" | "very_urgent";
export type CorrStatus = "pending" | "processed" | "archived";
export interface Correspondence {
  id: ID;
  direction: "in" | "out";
  reference: string;
  subject: string;
  party: string; // source (in) or destination (out)
  date: string;
  category: string;
  academicYear: string;
  priority: Priority;
  status: CorrStatus;
  notes: string;
  deletedAt: string | null;
  createdAt: string;
}

export type StaffKind = "teacher" | "employee";
export type StaffStatus = "active" | "leave" | "transferred" | "retired";
export interface Staff {
  id: ID;
  kind: StaffKind;
  fullName: string;
  employeeId: string;
  recruitmentDate: string;
  grade: string;
  assignment: string; // class (teacher) or service (employee)
  status: StaffStatus;
  phone: string;
  notes: string;
  deletedAt: string | null;
  createdAt: string;
}

/** performance=المردودية, evaluation=التنقيط, absence, leave, training, decision */
export type StaffRecordType = "performance" | "evaluation" | "absence" | "leave" | "training" | "decision";
export interface StaffRecord {
  id: ID;
  staffId: ID;
  staffKind: StaffKind;
  type: StaffRecordType;
  period: string;
  date: string;
  dateEnd: string;
  score: string;
  details: string;
  createdAt: string;
}

// Planned modules — models defined, UI not yet implemented.
export interface SchoolClass { id: ID; name: string; level: string; academicYear: string; teacherId: ID | null }
export interface Student { id: ID; fullName: string; gender: "m" | "f"; birthDate: string; classId: ID | null; enrollmentYear: string; status: string }
export interface InventoryItem { id: ID; inventoryNumber: string; name: string; category: string; location: string; status: string; acquisitionDate: string; notes: string; deletedAt?: string | null }
export interface Template { id: ID; name: string; kind: string; body: string }

export interface Settings {
  id: "main";
  schoolName: string;
  city: string;
  wilaya: string;
  directorate: string;
  headerLine: string;
  currentYear: string;
  prefixIn: string;
  prefixOut: string;
  locale: "ar" | "fr";
}

export interface AuditLog { id: ID; at: string; action: string; entity: string; entityId: ID; summary: string }
