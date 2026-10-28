// TypeScript types matching FastAPI / Pydantic models from backend

export type UserRole = 'ADMIN' | 'REVIEWER' | 'APPLICANT' | 'VIGILANCE_OFFICER';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'VALIDATION_IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'DEFICIENCY_FLAGGED'
  | 'RECTIFICATION_REQUESTED'
  | 'PENDING_HUMAN_REVIEW'
  | 'APPROVED_BY_REVIEWER'
  | 'REJECTED_BY_REVIEWER';

export type VerificationStatus =
  | 'VERIFIED'
  | 'MISMATCH'
  | 'EXPIRED'
  | 'PENDING'
  | 'SOURCE_UNAVAILABLE'
  | 'MANUAL_REVIEW_REQUIRED';

export type FlagSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type DocumentType =
  | 'LAND_OWNERSHIP_DOCUMENT'
  | 'BUILDING_PLAN_AND_APPROVAL'
  | 'FIRE_SAFETY_CERTIFICATE'
  | 'AFFIDAVIT'
  | 'NBA_ACCREDITATION'
  | 'FACULTY_PROFILE_LIST'
  | 'TER_PAYMENT_CHALLAN'
  | 'WALKTHROUGH_VIDEO'
  | 'INFRASTRUCTURE_PHOTO';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  institution_id?: number | null;
  is_active: boolean;
}

export interface Application {
  id: number;
  application_number: string;
  institution_id: number;
  academic_year: string;
  category: string;
  status: ApplicationStatus;
  declared_data: Record<string, any>;
  validation_summary?: Record<string, any>;
  historical_aicte_records?: Record<string, any>;
  created_at: string;
  updated_at: string;
  applicable_checklist?: ChecklistItem[];
}

export interface ChecklistItem {
  rule_id: number;
  document_type: DocumentType;
  rule_name: str;
  is_mandatory: boolean;
  required_fields: string[];
  uploaded: boolean;
  document_id?: number | null;
  verification_status?: VerificationStatus | null;
}

type str = string;

export interface DocumentItem {
  id: number;
  application_id: number;
  document_type: DocumentType;
  filename: string;
  file_path: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string;
  raw_ocr_text?: string;
  pdf_metadata?: Record<string, any>;
  extracted_fields?: Record<string, any>;
  issuing_authority?: string;
  document_urn_or_id?: string;
  issue_date?: string;
  expiry_date?: string;
  verification_status: VerificationStatus;
  verification_details?: Record<string, any>;
  uploaded_at: string;
}

export interface ValidationFlag {
  id: number;
  application_id: number;
  document_id?: number | null;
  rule_id?: number | null;
  flag_category: string;
  severity: FlagSeverity;
  field_name?: string | null;
  reason: string;
  evidence_snippet?: string | null;
  page_number?: number | null;
  is_advisory: boolean;
  is_resolved: boolean;
  reviewer_action?: string | null;
  reviewer_notes?: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  applications: {
    total: number;
    approved: number;
    flagged: number;
    under_review: number;
  };
  documents: {
    total: number;
    verified: number;
    flagged_for_review: number;
    authority_status_breakdown: Record<VerificationStatus, number>;
  };
  flags: {
    total: number;
    critical: number;
    resolved: number;
    pending_resolution: number;
  };
  model_registry: Record<string, any>;
  system_status: {
    mode: string;
    database: string;
    ollama_ready?: boolean;
    chroma_ready?: boolean;
    gpu_active?: boolean;
  };
}

export interface AuditLog {
  id: number;
  timestamp: string;
  actor_user_id?: number;
  application_id?: number;
  action_type: string;
  entity_type: string;
  entity_id?: string;
  summary: string;
  record_hash: string;
  prev_record_hash: string;
}
