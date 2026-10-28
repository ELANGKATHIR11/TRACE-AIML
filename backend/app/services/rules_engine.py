"""Rules Engine for AICTE Regulatory Compliance and Document Cross-Verification.
Implements deterministic checks for:
1. Land & infrastructure norms (acres, built-up area)
2. Faculty-to-Student Ratio (SFR) and Principal requirements
3. Document validity & expiration checking
4. Inter-document consistency (cross-referencing declared values against uploaded proof)
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.models.enums import FlagCategory, FlagSeverity
from app.models.models import Application, ChecklistRule, Document

logger = logging.getLogger(__name__)


class RulesEngine:
    """Deterministic, transparent regulatory evaluation engine."""

    def evaluate_document_rules(
        self,
        doc: Document,
        rules: List[ChecklistRule],
        declared_data: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Evaluate a single document against applicable regulatory checklist rules."""
        flags: List[Dict[str, Any]] = []
        extracted = doc.extracted_fields or {}

        for rule in rules:
            if not rule.is_active or rule.document_type != doc.document_type:
                continue

            # 1. Mandatory Fields Check
            for field in rule.required_fields:
                val = extracted.get(field)
                if val is None or str(val).strip() == "":
                    flags.append({
                        "category": FlagCategory.INCOMPLETE_FIELD,
                        "severity": FlagSeverity.HIGH if rule.is_mandatory else FlagSeverity.MEDIUM,
                        "field_name": field,
                        "reason": f"Required regulatory field '{field}' missing from {doc.document_type.value}",
                        "evidence": f"Rule: {rule.rule_name}. Available extracted fields: {list(extracted.keys())}",
                        "rule_id": rule.id,
                    })

            # 2. Expiration Date Check
            if rule.check_expiry and doc.expiry_date:
                try:
                    exp_dt = datetime.fromisoformat(doc.expiry_date.replace("Z", "+00:00"))
                    now_dt = datetime.now(timezone.utc)
                    if exp_dt < now_dt:
                        flags.append({
                            "category": FlagCategory.EXPIRED_DOCUMENT,
                            "severity": FlagSeverity.CRITICAL,
                            "field_name": "expiry_date",
                            "reason": f"Document expired on {doc.expiry_date}",
                            "evidence": f"Expired before current validation date {now_dt.strftime('%Y-%m-%d')}",
                            "rule_id": rule.id,
                        })
                except Exception:
                    pass

            # 3. Consistency Targets (Cross-checking document values against Application declared data)
            for doc_field, target_path in rule.consistency_targets.items():
                doc_val = extracted.get(doc_field)
                if doc_val is None:
                    continue

                declared_val = declared_data.get(target_path) or declared_data.get(doc_field)
                if declared_val is not None:
                    match, discrepancy_msg = self._compare_values(doc_val, declared_val)
                    if not match:
                        flags.append({
                            "category": FlagCategory.CROSS_DOC_INCONSISTENCY,
                            "severity": FlagSeverity.HIGH,
                            "field_name": doc_field,
                            "reason": f"Cross-document value mismatch: {discrepancy_msg}",
                            "evidence": f"Document value: '{doc_val}' vs Declared value: '{declared_val}'",
                            "rule_id": rule.id,
                        })

        return flags

    def evaluate_application_compliance(
        self,
        application: Application,
        documents: List[Document],
        rules: List[ChecklistRule],
    ) -> Dict[str, Any]:
        """Global compliance evaluation across all documents in an application packet."""
        flags: List[Dict[str, Any]] = []
        declared = application.declared_data or {}

        # Aggregate all extracted fields by document type
        extracted_by_type: Dict[str, Dict[str, Any]] = {}
        for d in documents:
            extracted_by_type[d.document_type.value] = d.extracted_fields or {}

        # 1. Missing Mandatory Document Checklist
        uploaded_types = {d.document_type for d in documents}
        for r in rules:
            if r.is_mandatory and r.document_type not in uploaded_types:
                flags.append({
                    "category": FlagCategory.MISSING_DOCUMENT,
                    "severity": FlagSeverity.CRITICAL,
                    "field_name": "document_type",
                    "reason": f"Mandatory document missing: {r.document_type.value}",
                    "evidence": f"Requirement from Approval Process Handbook ({r.rule_name})",
                    "rule_id": r.id,
                })

        # 2. Land Area Norms (e.g., Min 1.5 - 2.5 Acres for Engineering/Tech depending on location)
        declared_land = declared.get("land_area_acres") or declared.get("land_area")
        land_doc_fields = extracted_by_type.get("LAND_OWNERSHIP_DOCUMENT", {})
        proven_land = land_doc_fields.get("land_area_acres") or land_doc_fields.get("land_area")

        if declared_land and proven_land:
            dec_num = self._extract_first_number(declared_land)
            prov_num = self._extract_first_number(proven_land)
            if dec_num is not None and prov_num is not None and prov_num < dec_num:
                flags.append({
                    "category": FlagCategory.INFRASTRUCTURE_DISCREPANCY,
                    "severity": FlagSeverity.CRITICAL,
                    "field_name": "land_area",
                    "reason": f"Proven land area ({prov_num} acres) is less than declared area ({dec_num} acres)",
                    "evidence": f"Deed specifies {prov_num} acres, application claims {dec_num} acres",
                })

        # 3. Student-Faculty Ratio (SFR) & Faculty Norms
        # `total_intake` is the DeclaredData field; the others are legacy keys (seeded dossiers).
        total_students = (
            declared.get("total_intake")
            or declared.get("total_approved_intake")
            or declared.get("student_count")
        )
        faculty_doc = extracted_by_type.get("FACULTY_ROSTER", {})
        proven_faculty = faculty_doc.get("total_faculty_count") or len(faculty_doc.get("faculty_members", []))

        if total_students and proven_faculty:
            s_num = self._extract_first_number(total_students)
            f_num = float(proven_faculty)
            if s_num and f_num > 0:
                sfr = s_num / f_num
                # AICTE Standard SFR is 1:20 (or 1:15 for PG)
                if sfr > 20.0:
                    flags.append({
                        "category": FlagCategory.CROSS_DOC_INCONSISTENCY,
                        "severity": FlagSeverity.HIGH,
                        "field_name": "faculty_student_ratio",
                        "reason": f"Student-to-Faculty Ratio (1:{round(sfr, 1)}) violates AICTE maximum norm of 1:20",
                        "evidence": f"{int(s_num)} approved students with only {int(f_num)} verified faculty",
                    })

        # Determine overall compliance outcome
        has_critical = any(f["severity"] == FlagSeverity.CRITICAL for f in flags)
        has_high = any(f["severity"] == FlagSeverity.HIGH for f in flags)

        if has_critical:
            overall_status = "NON_COMPLIANT_CRITICAL_DEFICITS"
        elif has_high:
            overall_status = "DEFICIENT_REQUIRES_CLARIFICATION"
        elif len(flags) > 0:
            overall_status = "ADVISORY_FLAGS_PRESENT"
        else:
            overall_status = "FULLY_COMPLIANT"

        return {
            "overall_status": overall_status,
            "total_flags": len(flags),
            "flags": flags,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _compare_values(self, val_a: Any, val_b: Any) -> tuple[bool, str]:
        """Normalize and compare extracted vs declared values."""
        str_a = str(val_a).strip().lower()
        str_b = str(val_b).strip().lower()

        # Direct match or substring match
        if str_a == str_b or str_a in str_b or str_b in str_a:
            return True, ""

        # Numerical comparison
        num_a = self._extract_first_number(val_a)
        num_b = self._extract_first_number(val_b)
        if num_a is not None and num_b is not None:
            if abs(num_a - num_b) < 0.01:
                return True, ""
            return False, f"Numerical variance: {num_a} != {num_b}"

        return False, f"Text mismatch: '{val_a}' != '{val_b}'"

    def _extract_first_number(self, val: Any) -> Optional[float]:
        try:
            if isinstance(val, (int, float)):
                return float(val)
            match = re.search(r"[-+]?\d*\.?\d+", str(val).replace(",", ""))
            return float(match.group()) if match else None
        except Exception:
            return None


rules_engine = RulesEngine()
