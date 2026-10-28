/**
 * Contract-derived TypeScript definitions for AICTE TRACE FastAPI Backend.
 * Strictly prohibits fabricated defaults; optional/nullable fields reflect
 * potential variations in backend responses and are rendered honestly as
 * "Not provided by API" when absent.
 */

export enum PersonaRole {
  OFFICIAL = 'OFFICIAL',
  REVIEWER = 'REVIEWER',
  APPLICANT = 'APPLICANT',
}

export interface RequestedPersona {
  id: 'official' | 'applicant';
  label: string;
  email: string;
  role: PersonaRole;
  institutionId?: number;
  capabilitiesDescription: string;
}

export enum AuthorityIdentifier {
  STATE_BHULEKH = 'STATE_BHULEKH',
  FIRE_PORTAL = 'FIRE_PORTAL',
  DIGILOCKER_ESTAMP = 'DIGILOCKER_ESTAMP',
  AICTE_NBA_PORTAL = 'AICTE_NBA_PORTAL',
  FACULTY_REGISTRY = 'FACULTY_REGISTRY',
}

export enum AuthorityVerificationStatus {
  VERIFIED = 'VERIFIED',
  MISMATCH = 'MISMATCH',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED',
}

export enum OfficerDecisionType {
  APPROVE = 'APPROVE',
  REQUEST_CORRECTION = 'REQUEST_CORRECTION',
  ESCALATE = 'ESCALATE',
}

export enum DocumentCategory {
  LAND_DEED = 'Land Deed',
  FIRE_NOC = 'Fire NOC',
  BUILDING_PLAN = 'Building Plan',
  AFFIDAVIT = 'Affidavit',
  NBA_CERTIFICATE = 'NBA Certificate',
  FACULTY_ROSTER = 'Faculty Roster',
}

export interface GatewayBreakdownItem {
  gateway?: string;
  authority?: string;
  verified?: number;
  mismatch?: number;
  pending?: number;
  expired?: number;
  unavailable?: number;
  total?: number;
  status?: string;
  count?: number;
}

export interface ModelEvaluationMetrics {
  accuracy?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1_score?: number | null;
  f1?: number | null;
}

export interface ModelRegistryItem {
  id?: string;
  name: string;
  model_type?: string;
  version?: string | null;
  status?: string | null;
  metrics?: ModelEvaluationMetrics | null;
  accuracy?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1_score?: number | null;
  last_updated?: string | null;
  updated_at?: string | null;
  provenance?: string | null;
}

export interface DashboardMetricsResponse {
  total_applications?: number | null;
  applications_under_review?: number | null;
  under_review?: number | null;
  applications_with_deficiencies?: number | null;
  deficiencies_flagged?: number | null;
  approved_applications?: number | null;
  escalated_applications?: number | null;
  verification_gateway_breakdown?: Record<string, unknown> | GatewayBreakdownItem[] | null;
  gateway_breakdown?: Record<string, unknown> | GatewayBreakdownItem[] | null;
  models?: ModelRegistryItem[] | Record<string, unknown> | null;
  model_registry?: ModelRegistryItem[] | Record<string, unknown> | null;
  generated_at?: string | null;
  time_range?: string | null;
  [key: string]: unknown;
}

export interface MetricComparisonRow {
  field_name: string;
  label?: string;
  declared_value: string | number | null | undefined;
  baseline_value?: string | number | null | undefined;
  reference_value?: string | number | null | undefined;
  unit?: string | null;
  source?: string | null;
  provenance?: string | null;
  difference?: string | number | null;
  status?: string | null;
  verification_status?: string | null;
  evidence?: string | null;
}

export interface BoundingBoxCoordinate {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
  normalized?: boolean;
  image_width?: number;
  image_height?: number;
  label?: string;
}

export interface DocumentRecord {
  id: string | number;
  application_id?: string | number | null;
  document_type?: string | null;
  category?: string | null;
  filename?: string | null;
  file_name?: string | null;
  content_type?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  page_count?: number | null;
  status?: string | null;
  verification_status?: string | null;
  uploaded_at?: string | null;
  created_at?: string | null;
  sha256_hash?: string | null;
  file_hash?: string | null;
  eligible_for_rectification?: boolean | null;
  deficiency_reason?: string | null;
}

export interface ComplianceFlag {
  id: string | number;
  application_id?: string | number | null;
  finding_type?: string | null;
  flag_type?: string | null;
  type?: string | null;
  severity?: string | null;
  status?: string | null;
  title?: string | null;
  description?: string | null;
  evidence_snippet?: string | null;
  snippet?: string | null;
  source_document_id?: string | number | null;
  document_id?: string | number | null;
  source_document_name?: string | null;
  document_type?: string | null;
  page?: number | null;
  page_number?: number | null;
  confidence?: number | null;
  confidence_score?: number | null;
  model_name?: string | null;
  model_provenance?: string | null;
  statutory_reference?: string | null;
  suggested_action?: string | null;
  highlight_terms?: string[] | null;
  bounding_box?: BoundingBoxCoordinate | null;
  created_at?: string | null;
}

export interface AuthorityVerificationRecord {
  authority_id: string;
  authority_name?: string | null;
  status: AuthorityVerificationStatus | string;
  verified_at?: string | null;
  checked_at?: string | null;
  reference_id?: string | null;
  provenance?: string | null;
  source_endpoint?: string | null;
  details?: string | null;
  message?: string | null;
  discrepancy_summary?: string | null;
}

export interface ApplicationRecord {
  id: string | number;
  application_number?: string | null;
  institution_id?: number | string | null;
  institution_name?: string | null;
  category?: string | null;
  application_category?: string | null;
  academic_year?: string | null;
  status?: string | null;
  declared_land_area?: number | null;
  land_area_acres?: number | null;
  built_up_area?: number | null;
  built_up_area_sqm?: number | null;
  total_intake?: number | null;
  intake?: number | null;
  faculty_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  submitted_at?: string | null;
  deficiencies_count?: number | null;
  flags_count?: number | null;
}

export interface DecisionHistoryItem {
  id?: string | number;
  decision: OfficerDecisionType | string;
  officer_email?: string | null;
  officer_id?: string | null;
  officer_notes?: string | null;
  notes?: string | null;
  created_at?: string | null;
  timestamp?: string | null;
}

export interface ApplicationDetailRecord extends ApplicationRecord {
  documents?: DocumentRecord[] | null;
  flags?: ComplianceFlag[] | null;
  discrepancies?: MetricComparisonRow[] | null;
  metric_comparisons?: MetricComparisonRow[] | null;
  baselines?: Record<string, unknown> | null;
  authority_verifications?: AuthorityVerificationRecord[] | Record<string, unknown> | null;
  source_verifications?: AuthorityVerificationRecord[] | Record<string, unknown> | null;
  decisions?: DecisionHistoryItem[] | null;
  latest_decision?: DecisionHistoryItem | null;
  agent_review?: AgentReviewResponse | null;
}

export interface ApplicationCreateRequest {
  category: string;
  academic_year: string;
  declared_land_area: number;
  built_up_area: number;
  total_intake: number;
  faculty_count: number;
  institution_id?: number;
  institution_name?: string;
}

export interface AgentStageOutput {
  stage_name?: string;
  agent_name?: string;
  name?: string;
  status?: string;
  summary?: string;
  output?: string | Record<string, unknown>;
  findings?: string[] | Record<string, unknown>[];
  evidence_references?: string[];
  timestamp?: string;
  duration_ms?: number;
}

export interface AgentReviewResponse {
  application_id?: string | number;
  status: string;
  job_id?: string | null;
  framework?: string | null;
  vector_store?: string | null;
  stages?: AgentStageOutput[] | null;
  agents?: AgentStageOutput[] | null;
  steps?: AgentStageOutput[] | null;
  summary?: string | null;
  compliance_findings?: Array<string | Record<string, unknown>> | null;
  evidence_references?: Array<string | Record<string, unknown>> | null;
  warnings?: string[] | null;
  errors?: string[] | null;
  executed_at?: string | null;
  execution_time_ms?: number | null;
  raw_payload?: Record<string, unknown>;
}

export interface DecisionRequest {
  decision: OfficerDecisionType;
  officer_notes?: string;
  notes?: string;
}

export interface DecisionResponse {
  id?: string | number;
  application_id?: string | number;
  decision: string;
  status?: string;
  officer_notes?: string | null;
  officer_id?: string | null;
  decided_at?: string | null;
  timestamp?: string | null;
  message?: string | null;
  audit_hash?: string | null;
}

export interface RectificationSubmitRequest {
  notes?: string;
  justification?: string;
  amended_parameters?: {
    declared_land_area?: number;
    built_up_area?: number;
    total_intake?: number;
    faculty_count?: number;
  };
}

export interface RectificationSubmitResponse {
  application_id?: string | number;
  status: string;
  message?: string | null;
  submitted_at?: string | null;
  differential_verification_triggered?: boolean | null;
  updated_fields?: string[] | null;
}

export interface AuditLogEntry {
  id: string | number;
  timestamp?: string | null;
  created_at?: string | null;
  actor?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  details?: string | Record<string, unknown> | null;
  previous_hash?: string | null;
  prev_hash?: string | null;
  current_hash?: string | null;
  hash?: string | null;
  merkle_root?: string | null;
}

export interface ChainVerificationResponse {
  valid?: boolean | null;
  is_valid?: boolean | null;
  status?: string | null;
  verified_count?: number | null;
  total_events?: number | null;
  algorithm?: string | null;
  structure_type?: string | null;
  merkle_root?: string | null;
  latest_hash?: string | null;
  broken_at_id?: string | number | null;
  details?: string | null;
  message?: string | null;
  verified_at?: string | null;
}

export interface DocumentPreviewMetadataResponse {
  document_id?: string | number;
  page?: number;
  total_pages?: number;
  image_url?: string | null;
  image_base64?: string | null;
  media_type?: string | null;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  bounding_boxes?: BoundingBoxCoordinate[] | null;
  matches?: BoundingBoxCoordinate[] | null;
  extracted_text?: string | null;
}

export interface ElaAnalysisResponse {
  document_id?: string | number;
  status?: string;
  ela_image_url?: string | null;
  ela_image_base64?: string | null;
  max_difference?: number | null;
  mean_error_level?: number | null;
  anomaly_score?: number | null;
  tamper_regions?: BoundingBoxCoordinate[] | null;
  metadata?: Record<string, unknown> | null;
}

export interface OpenAPISpec {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, Record<string, unknown>>;
}
