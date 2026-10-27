"""Grounded three-role AI review of an application, run on the local Ollama model.

Roles mirror the project's agent design (forensic auditor -> regulatory officer -> evidence compiler),
but every prompt is built from the application's real database records and retrieved handbook clauses.
If the local model is not reachable the review is NOT produced; nothing is simulated or templated.
Output is advisory only and is recorded in the audit log.
"""

import logging
from typing import Any, Dict, List

from sqlmodel import Session, select

from app.models.models import Application, Document, ValidationFlag
from app.services.ollama_service import ollama_service

logger = logging.getLogger(__name__)

GUARDRAIL = (
    "Use ONLY the data supplied below. If the data does not support a statement, say it is not shown. "
    "Do not invent numbers, rules, citations or document contents. Your output is advisory: never state "
    "that an application is approved or rejected, and never call a document 'forged' - describe indicators "
    "that need human verification. Refer to findings by their [F<id>] tag. Be concise (under 200 words)."
)


def _flag_line(f: ValidationFlag) -> str:
    ev = f" | evidence: {f.evidence_snippet}" if f.evidence_snippet else ""
    return f"[F{f.id}] {f.severity.value} {f.flag_category.value}: {f.reason}{ev}"


class AgentReviewService:
    def run(self, db: Session, application_id: int) -> Dict[str, Any]:
        app_obj = db.get(Application, application_id)
        if not app_obj:
            raise ValueError("Application not found")

        if not ollama_service.is_available():
            return {
                "available": False,
                "reason": (
                    f"Local model server not reachable at {ollama_service.base_url}. "
                    f"Start Ollama and pull '{ollama_service.default_model}' to enable the AI review. "
                    "The rule-based validation results are unaffected."
                ),
                "steps": [],
            }

        docs = db.exec(select(Document).where(Document.application_id == application_id)).all()
        flags = db.exec(select(ValidationFlag).where(ValidationFlag.application_id == application_id)).all()
        if not flags and not docs:
            return {"available": True, "reason": "No documents or findings to review yet.", "steps": []}

        forensic_flags = [f for f in flags if f.flag_category.value in ("POTENTIAL_FORGERY_OR_ALTERATION", "DUPLICATE_SUBMISSION")]
        rule_flags = [f for f in flags if f not in forensic_flags]

        doc_lines = []
        for d in docs:
            forensics = (d.verification_details or {}).get("forensics", {})
            doc_lines.append(
                f"- {d.filename} ({d.document_type.value}): status={d.verification_status.value}, "
                f"forensic_score={forensics.get('forensic_score', 'n/a')}, "
                f"producer={forensics.get('metadata_audited', {}).get('producer', 'n/a')}"
            )

        # Ground the compliance step in the handbook clauses most relevant to the actual findings.
        clauses: List[Dict[str, Any]] = []
        try:
            from app.services.vector_rag_service import vector_rag_service
            query = " ".join(f.reason for f in rule_flags[:4]) or "approval requirements"
            clauses = vector_rag_service.query_regulatory_knowledge(query, top_k=3)
        except Exception as exc:  # RAG is optional context, not a hard dependency
            logger.warning("RAG context unavailable for agent review: %s", exc)
        clause_text = "\n".join(
            f"- {c['metadata'].get('statutory_citation', c['id'])}: {c['text']}" for c in clauses
        ) or "(no handbook clauses retrieved)"

        steps: List[Dict[str, Any]] = []

        def ask(role: str, system: str, user: str) -> Dict[str, Any]:
            res = ollama_service.chat_completion(
                [{"role": "system", "content": f"{system}\n{GUARDRAIL}"}, {"role": "user", "content": user}],
                temperature=0.1, max_tokens=700,
            )
            ok = res.get("status") == "success"
            step = {
                "role": role, "ok": ok, "model": res.get("model"),
                "output": res.get("content", "").strip() if ok else None,
                "error": None if ok else res.get("error", "unknown error"),
            }
            steps.append(step)
            return step

        s1 = ask(
            "Forensic document auditor",
            "You are a document forensics reviewer for the AICTE Regulation Bureau.",
            f"Application {app_obj.application_number}.\nDocuments:\n" + "\n".join(doc_lines)
            + "\n\nTampering / duplication indicators:\n"
            + ("\n".join(_flag_line(f) for f in forensic_flags) or "(none)")
            + "\n\nSummarise what these indicators suggest and what a human should verify.",
        )
        s2 = ask(
            "Regulatory compliance officer",
            "You are a regulatory officer checking an application against the Approval Process Handbook.",
            f"Declared data: {app_obj.declared_data}\n\nFindings:\n"
            + ("\n".join(_flag_line(f) for f in rule_flags) or "(none)")
            + f"\n\nRelevant handbook clauses:\n{clause_text}\n\nExplain which findings relate to which clause.",
        )
        s3 = ask(
            "Evidence compiler",
            "You compile a short scrutiny note for the human officer.",
            f"Forensic review:\n{s1['output'] or 'unavailable'}\n\nCompliance review:\n{s2['output'] or 'unavailable'}\n\n"
            "Write a brief note listing the items the officer should look at first, in priority order.",
        )

        return {
            "available": True,
            "application_number": app_obj.application_number,
            "model": s3.get("model"),
            "all_steps_ok": all(s["ok"] for s in steps),
            "steps": steps,
            "grounding": {"flags_considered": len(flags), "documents_considered": len(docs), "handbook_clauses": len(clauses)},
        }


agent_review_service = AgentReviewService()
