from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import (
    ApplicationCategory,
    ApplicationStatus,
    DocumentType,
    FlagCategory,
    FlagSeverity,
    OfficerDecisionType,
    UserRole,
    VerificationStatus,
)


# --- Auth & User Schemas ---
# A syntactically valid address, trimmed and lower-cased (accounts are matched case-insensitively).
NormalizedEmail = Annotated[EmailStr, AfterValidator(str.lower)]


class UserRead(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    institution_id: Optional[int]
    is_active: bool
    must_change_password: bool
    created_at: datetime


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    # Policy (length, not equal to email) is enforced by security.validate_password_policy.
    new_password: str = Field(max_length=1024)


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: NormalizedEmail
    full_name: str = Field(min_length=1, max_length=200)
    role: UserRole
    institution_id: Optional[int] = None
    # Policy (length, not equal to email) is enforced by security.validate_password_policy.
    temporary_password: str = Field(max_length=1024)


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role: Optional[UserRole] = None
    institution_id: Optional[int] = None
    is_active: Optional[bool] = None
    reset_password: Optional[str] = Field(default=None, max_length=1024)


# --- Institution Schemas ---
class InstitutionCreate(BaseModel):
    aicte_permanent_id: str
    name: str
    state: str
    district: str
    address: str
    established_year: int
    historical_records: Dict[str, Any] = Field(default_factory=dict)


class InstitutionRead(BaseModel):
    id: int
    aicte_permanent_id: str
    name: str
    state: str
    district: str
    address: str
    established_year: int
    historical_records: Dict[str, Any]
    created_at: datetime


# --- Configurable Checklist Rule Schemas ---
class ChecklistRuleCreate(BaseModel):
    handbook_year: str = "2026-27"
    category: ApplicationCategory
    document_type: DocumentType
    rule_name: str
    description: str
    is_mandatory: bool = True
    check_expiry: bool = True
    required_fields: List[str] = Field(default_factory=list)
    consistency_targets: Dict[str, str] = Field(default_factory=dict)
    infrastructure_thresholds: Dict[str, Any] = Field(default_factory=dict)


class ChecklistRuleUpdate(BaseModel):
    rule_name: Optional[str] = None
    description: Optional[str] = None
    is_mandatory: Optional[bool] = None
    check_expiry: Optional[bool] = None
    required_fields: Optional[List[str]] = None
    consistency_targets: Optional[Dict[str, str]] = None
    infrastructure_thresholds: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


# --- Application Schemas ---
class DeclaredData(BaseModel):
    """Figures the applicant declares on the application form (spec §6.2)."""
    model_config = ConfigDict(extra="forbid")

    land_area_acres: Optional[float] = Field(default=None, ge=0, le=1000)
    built_up_area_sqm: Optional[float] = Field(default=None, ge=0, le=1_000_000)
    total_intake: Optional[int] = Field(default=None, ge=0, le=10_000)
    faculty_count: Optional[int] = Field(default=None, ge=0, le=5_000)


class ApplicationCreate(BaseModel):
    # institution_id is taken from the authenticated applicant, never from the body (spec §4.3).
    model_config = ConfigDict(extra="forbid")

    academic_year: str = "2026-27"
    category: ApplicationCategory = ApplicationCategory.EOA
    declared_data: DeclaredData = Field(default_factory=DeclaredData)


class ChecklistItemStatus(BaseModel):
    rule_id: int
    document_type: DocumentType
    rule_name: str
    is_mandatory: bool
    required_fields: List[str]
    uploaded: bool
    document_id: Optional[int] = None
    verification_status: Optional[VerificationStatus] = None


class OfficerDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: OfficerDecisionType
    notes: str = Field(min_length=10, max_length=4000)


class DecisionRead(BaseModel):
    id: int
    application_id: int
    decision: OfficerDecisionType
    notes: str
    officer_id: int
    decided_at: datetime
    audit_hash: Optional[str] = None


class OfficerDecisionResponse(DecisionRead):
    status: ApplicationStatus


class ApplicationDetailResponse(BaseModel):
    id: int
    application_number: str
    institution_id: int
    academic_year: str
    category: ApplicationCategory
    status: ApplicationStatus
    declared_data: Dict[str, Any]
    validation_summary: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    applicable_checklist: List[ChecklistItemStatus]
    historical_aicte_records: Dict[str, Any]
    institution_name: str
    documents: List["DocumentRead"]
    decisions: List[DecisionRead]
    latest_decision: Optional[DecisionRead] = None


# --- Document & Flag Schemas ---
class DocumentUploadResponse(BaseModel):
    id: Optional[int] = None
    document_id: int
    application_id: int
    filename: str
    document_type: DocumentType
    sha256_hash: str
    verification_status: VerificationStatus
    message: str


class DocumentRead(BaseModel):
    id: int
    application_id: int
    document_type: DocumentType
    filename: str
    mime_type: str
    file_size_bytes: int
    sha256_hash: str
    raw_ocr_text: Optional[str] = None
    pdf_metadata: Dict[str, Any] = Field(default_factory=dict)
    extracted_fields: Dict[str, Any] = Field(default_factory=dict)
    issuing_authority: Optional[str] = None
    document_urn_or_id: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    verification_status: VerificationStatus
    verification_details: Dict[str, Any] = Field(default_factory=dict)
    uploaded_at: datetime


class RectificationSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str = Field(default="", max_length=4000)
    # Partial: only the fields the client sent are merged into the application's declared_data.
    amended: DeclaredData = Field(default_factory=DeclaredData)


class RectificationSubmitResponse(BaseModel):
    application_id: int
    status: ApplicationStatus
    submitted_at: datetime
    updated_fields: List[str]


class AuthorityVerificationRead(BaseModel):
    document_id: int
    document_type: DocumentType
    authority_name: Optional[str] = None
    status: VerificationStatus
    checked_at: Optional[datetime] = None
    reference_id: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class ValidationFlagRead(BaseModel):
    id: int
    application_id: int
    document_id: Optional[int] = None
    rule_id: Optional[int] = None
    flag_category: FlagCategory
    severity: FlagSeverity
    field_name: Optional[str] = None
    reason: str
    evidence_snippet: Optional[str] = None
    page_number: Optional[int] = None
    is_advisory: bool
    is_resolved: bool
    reviewer_action: Optional[str] = None
    reviewer_notes: Optional[str] = None
    created_at: datetime


ApplicationDetailResponse.model_rebuild()
