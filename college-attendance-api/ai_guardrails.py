"""
ai_guardrails.py — Zero-Trust AI Safety Layer
==============================================
Three independent checks applied around every Gemini call:

  1. get_guardrail_addendum()  → injected into system prompt (input guardrail)
  2. redact_pii()              → strips PII from log JSON before LLM sees it
  3. post_response_check()     → scans LLM output for leaked data (output guardrail)
"""

import re
import json

# ──────────────────────────────────────────────
# 1. SYSTEM PROMPT GUARDRAIL
# ──────────────────────────────────────────────

_PERSONAL_RULE = """
ZERO-TRUST SECURITY POLICY (NON-NEGOTIABLE):
- You may ONLY discuss data belonging to user: {user_name}
- DENY any request asking about other users, other departments, or global statistics.
- If asked about data outside your scope, reply: "Access restricted — you can only view your own records."
"""

_DEPT_RULE = """
ZERO-TRUST SECURITY POLICY (NON-NEGOTIABLE):
- You may ONLY discuss data from the {department} department.
- DENY any request asking about other departments or global data.
- If asked about other departments, reply: "Access restricted — you can only view {department} department records."
"""

_GLOBAL_RULE = """
SECURITY POLICY:
- You have global access. All log queries are permitted.
- Do NOT reveal internal system architecture, API endpoints, or user passwords.
- All responses are subject to audit logging.
"""


def get_guardrail_addendum(permissions: list, user_name: str, department: str) -> str:
    """
    Returns the RBAC-appropriate denial rule to append to every system prompt.
    This is the primary input guardrail — the LLM is instructed to refuse
    out-of-scope queries before it even processes them.
    """
    if "ALL_ACCESS" in permissions or "LOGS_VIEW_ALL" in permissions:
        return _GLOBAL_RULE.strip()
    elif "LOGS_VIEW_DEPT" in permissions and department:
        return _DEPT_RULE.format(department=department).strip()
    else:
        return _PERSONAL_RULE.format(user_name=user_name or "this user").strip()


# ──────────────────────────────────────────────
# 2. PII REDACTION (applied BEFORE sending to LLM)
# ──────────────────────────────────────────────

_EMAIL_RE    = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", re.IGNORECASE)
_GUID_RE     = re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")
_PHONE_RE    = re.compile(r"(\+?\d[\d\s\-().]{7,}\d)")
_BEARER_RE   = re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)


def redact_pii(text: str) -> str:
    """
    Strips PII from a string (usually serialised log JSON) before it is
    sent to the LLM. Applied to every _get_ai_filtered_logs() result.
    """
    text = _EMAIL_RE.sub("[EMAIL]", text)
    text = _GUID_RE.sub("[GUID]", text)
    text = _BEARER_RE.sub("[TOKEN]", text)
    # Only redact phone-like strings that look genuinely numeric (avoid tag IDs like FIN-21)
    text = re.sub(r'\b(\+?\d[\d\s\-]{8,}\d)\b', "[PHONE]", text)
    return text


def redact_logs(logs: list) -> str:
    """
    Serialises a list of log dicts to JSON with PII stripped.
    Use this instead of json.dumps() when building LLM prompts.
    """
    raw = json.dumps(logs, default=str)
    return redact_pii(raw)


# ──────────────────────────────────────────────
# 3. POST-RESPONSE OUTPUT CHECK
# ──────────────────────────────────────────────

_RESTRICTION_MSG = (
    "\n\n> ⚠️ **[Campus Security Policy]** Part of this response was redacted "
    "because it contained information outside your access scope."
)


def post_response_check(response: str, allowed_names: set = None) -> str:
    """
    Scans the LLM's text output for:
      - Raw email addresses (should have been redacted before the prompt)
      - Azure AD GUIDs
    If found, replaces the whole response with a policy violation notice.

    allowed_names: set of names the user IS allowed to see (e.g. their own name).
    """
    # Check for raw emails in the response
    emails_found = _EMAIL_RE.findall(response)
    guids_found  = _GUID_RE.findall(response)

    if emails_found or guids_found:
        # Redact them rather than blocking the whole response
        cleaned = _EMAIL_RE.sub("[EMAIL]", response)
        cleaned = _GUID_RE.sub("[GUID]", cleaned)
        return cleaned + _RESTRICTION_MSG

    return response
