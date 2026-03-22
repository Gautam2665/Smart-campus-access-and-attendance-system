"""
AI Handler — Google Gemini 2.0 Flash via LangChain.
This standalone module mirrors the inline Flask logic and is kept as
a reference / for future Lambda deployment if needed.
"""

import json
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage


def _get_llm(temperature: float = 0.3) -> ChatGoogleGenerativeAI:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/")
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=api_key,
        temperature=temperature,
    )


def call_gemini(system_prompt: str, user_message: str, temperature: float = 0.3) -> str:
    """Calls Gemini 2.0 Flash and returns the text response."""
    llm = _get_llm(temperature)
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ])
    return response.content


def _strip_json_fences(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1].lstrip("json").strip() if len(parts) > 1 else cleaned
    return cleaned


def handle_chat(payload: dict) -> dict:
    """Natural Language → Answer about attendance logs."""
    logs = payload.get("logs", [])
    query = payload.get("query", "")
    user_name = payload.get("user_name", "User")
    department = payload.get("department", "")
    permissions = payload.get("permissions", [])

    dept_ctx = f"Department: {department}" if department else "Global Access"
    perm_level = ("Global Admin" if ("ALL_ACCESS" in permissions or "LOGS_VIEW_ALL" in permissions)
                  else "Department Manager" if "LOGS_VIEW_DEPT" in permissions
                  else "Personal View")

    system_prompt = f"""You are an AI security analyst for a Smart Campus Access Control System.
User: {user_name} | {dept_ctx} | Access Level: {perm_level}

RULES:
- Only reference the provided log data. Never fabricate entries.
- Answer concisely. Use bullet points for lists, code blocks for SQL.
- Schema: logs(id, tag_id, name, authorized, timestamp, source_type, department, anomaly_details, confidence_score, location_id)
- ZERO-TRUST: Logs are pre-filtered for this user. Do not speculate about other departments."""

    user_message = f"LOGS ({len(logs)} records):\n{json.dumps(logs, default=str)}\n\nQUESTION: {query}"
    answer = call_gemini(system_prompt, user_message, temperature=0.4)
    return {"answer": answer, "log_count": len(logs)}


def handle_analyze(payload: dict) -> dict:
    """Autonomous anomaly and threat detection."""
    logs = payload.get("logs", [])

    system_prompt = """You are an autonomous AI Security Analyst for a Campus Security System.
Detect threats: rapid repeated failures, off-hours access (10PM-5AM), high-confidence denials, location clusters.

Respond ONLY with valid JSON (no markdown):
{"threat_level":"LOW|MODERATE|HIGH|CRITICAL","summary":"One sentence.","threats":[{"type":"SPOOFING_ATTEMPT|TAILGATING|OFF_HOURS|CREDENTIAL_SHARING|ANOMALY_CLUSTER","severity":"LOW|MODERATE|HIGH","description":"...","affected_ids":[],"recommendation":"..."}],"statistics":{"total_logs":0,"authorized":0,"denied":0,"anomaly_count":0}}"""

    raw = call_gemini(system_prompt, f"Analyze these {len(logs)} logs:\n{json.dumps(logs, default=str)}", temperature=0.1)
    try:
        return json.loads(_strip_json_fences(raw))
    except json.JSONDecodeError:
        return {"threat_level": "UNKNOWN", "summary": raw, "threats": [], "statistics": {}}


def handle_risk_scores(payload: dict) -> dict:
    """Predictive risk scoring per identity."""
    logs = payload.get("logs", [])

    system_prompt = """You are a Predictive Security AI. Score risk per identity based on denial frequency, time patterns, anomaly flags.
Output ONLY valid JSON:
{"risk_profiles":[{"tag_id":"FIN-21","name":"Name","risk_level":"LOW|MODERATE|HIGH","risk_score":0.0,"reason":"Brief."}]}"""

    raw = call_gemini(system_prompt, f"Score these logs:\n{json.dumps(logs, default=str)}", temperature=0.1)
    try:
        return json.loads(_strip_json_fences(raw))
    except json.JSONDecodeError:
        return {"risk_profiles": [], "raw": raw}
