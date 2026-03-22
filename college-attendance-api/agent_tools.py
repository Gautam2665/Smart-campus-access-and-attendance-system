"""
agent_tools.py — LangGraph ReAct Agent Tools
Campus Security AI — Phase 4

IMPORTANT: Each tool opens its OWN sqlite3 connection per call.
Flask's query_db/execute_db use Flask.g which is request-context bound
and cannot cross into LangGraph's worker threads — bypassed entirely.
"""
import json as _json
import sqlite3
from langchain_core.tools import tool
from database import DATABASE   # reuse the resolved path (home vs local)


# ── Thread-safe DB helpers ──────────────────────────────────────────────────

def _thread_db():
    """Open a fresh SQLite connection in the current (worker) thread."""
    conn = sqlite3.connect(DATABASE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _qdb(conn, sql, params=()):
    cur = conn.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    return rows


def _qdb_one(conn, sql, params=()):
    cur = conn.execute(sql, params)
    row = cur.fetchone()
    cur.close()
    return row


def _xdb(conn, sql, params=()):
    cur = conn.execute(sql, params)
    conn.commit()
    cur.close()


# ── Tool factory ────────────────────────────────────────────────────────────

def build_tools(permissions: list, department: str):
    """
    Returns a list of LangChain tools scoped to the calling user's RBAC context.
    All DB access uses fresh per-call connections — safe for LangGraph threads.
    """

    is_global = 'ALL_ACCESS' in permissions or 'LOGS_VIEW_ALL' in permissions
    is_dept   = 'LOGS_VIEW_DEPT' in permissions

    # ------------------------------------------------------------------ #
    # TOOL 1 — query_logs                                                  #
    # ------------------------------------------------------------------ #
    @tool
    def query_logs(filter_json: str) -> str:
        """
        Query campus access logs.
        Pass a JSON string with optional fields:
          limit (int, default 50),
          anomaly_type (str: SPOOF | IDENTITY_MISMATCH | CREDENTIAL_SHARING),
          authorized (int: 0=denied, 1=granted),
          source_type (str: NFC_KIOSK | FINGERPRINT),
          days_back (int: filter to last N days, max 30).
        Returns a JSON array of matching log rows.
        Example: {"limit": 20, "anomaly_type": "SPOOF", "authorized": 0}
        """
        try:
            params_in = _json.loads(filter_json) if filter_json.strip() else {}
        except Exception:
            params_in = {}

        limit     = min(int(params_in.get("limit", 50)), 200)
        anomaly   = params_in.get("anomaly_type")
        auth      = params_in.get("authorized")   # None = any
        source    = params_in.get("source_type")
        days_back = min(int(params_in.get("days_back", 30)), 30)

        conditions = [f"l.timestamp >= datetime('now', '-{days_back} days')"]
        sql_params = []

        # RBAC scope
        if not is_global and is_dept and department:
            conditions.append("""
                l.tag_id IN (
                    SELECT 'FIN-' || finger_id FROM faculty WHERE UPPER(department) = UPPER(?)
                    UNION
                    SELECT t.tag_id FROM tags t 
                    LEFT JOIN app_users u ON t.email = u.email 
                    WHERE u.email IS NULL OR UPPER(u.department) = UPPER(?)
                )
            """)
            sql_params.extend([department, department])
        elif not is_global and not is_dept:
            return _json.dumps([])  # personal-only users get nothing from agent

        if anomaly:
            conditions.append("l.verification_type = ?")
            sql_params.append(anomaly)
        if auth is not None:
            conditions.append("l.authorized = ?")
            sql_params.append(int(auth))
        if source:
            conditions.append("l.source_type = ?")
            sql_params.append(source)

        where = "WHERE " + " AND ".join(conditions)
        sql   = f"SELECT l.* FROM logs AS l {where} ORDER BY l.timestamp DESC LIMIT {limit}"

        conn = _thread_db()
        try:
            rows = _qdb(conn, sql, sql_params)
            return _json.dumps([dict(r) for r in rows], default=str)
        except Exception as e:
            return _json.dumps({"error": str(e)})
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # TOOL 2 — get_risk_summary                                            #
    # ------------------------------------------------------------------ #
    @tool
    def get_risk_summary() -> str:
        """
        Returns a security snapshot for the last 7 days:
        total events, denied access, spoof attempts, identity mismatches, off-hours events.
        No input required.
        """
        conditions = ["l.timestamp >= datetime('now', '-7 days')"]
        sql_params = []

        if not is_global and is_dept and department:
            conditions.append("""
                l.tag_id IN (
                    SELECT 'FIN-' || finger_id FROM faculty WHERE UPPER(department) = UPPER(?)
                    UNION
                    SELECT t.tag_id FROM tags t 
                    LEFT JOIN app_users u ON t.email = u.email 
                    WHERE u.email IS NULL OR UPPER(u.department) = UPPER(?)
                )
            """)
            sql_params.extend([department, department])
        elif not is_global and not is_dept:
            return _json.dumps({"error": "Insufficient permissions"})

        where = "WHERE " + " AND ".join(conditions)

        conn = _thread_db()
        try:
            total     = _qdb_one(conn, f"SELECT COUNT(*) as c FROM logs l {where}", sql_params)
            denied    = _qdb_one(conn, f"SELECT COUNT(*) as c FROM logs l {where} AND l.authorized = 0", sql_params)
            spoof     = _qdb_one(conn, f"SELECT COUNT(*) as c FROM logs l {where} AND l.verification_type = 'SPOOF'", sql_params)
            mismatch  = _qdb_one(conn, f"SELECT COUNT(*) as c FROM logs l {where} AND l.verification_type = 'IDENTITY_MISMATCH'", sql_params)
            offhours  = _qdb_one(conn,
                f"SELECT COUNT(*) as c FROM logs l {where} AND "
                f"(CAST(strftime('%H', l.timestamp) AS INTEGER) >= 22 OR CAST(strftime('%H', l.timestamp) AS INTEGER) < 5)",
                sql_params)
            return _json.dumps({
                "period": "last 7 days",
                "scope": department if not is_global else "GLOBAL",
                "total_events":        total["c"]    if total    else 0,
                "denied_access":       denied["c"]   if denied   else 0,
                "spoof_attempts":      spoof["c"]    if spoof    else 0,
                "identity_mismatches": mismatch["c"] if mismatch else 0,
                "off_hours_events":    offhours["c"] if offhours else 0,
            })
        except Exception as e:
            return _json.dumps({"error": str(e)})
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # TOOL 3 — flag_identity                                               #
    # ------------------------------------------------------------------ #
    @tool
    def flag_identity(tag_id: str, reason: str) -> str:
        """
        Flags a campus identity for security review by writing an AI_FLAG anomaly log.
        Use only when you have evidence-backed justification.
        Args:
          tag_id: The NFC/fingerprint ID to flag (e.g. "FIN-21")
          reason: A concise explanation of why this identity is being flagged
        Returns a confirmation string.
        """
        if not is_global and not is_dept:
            return "Error: Insufficient permissions to flag identities."
        conn = _thread_db()
        try:
            _xdb(conn,
                """INSERT INTO logs
                   (tag_id, name, authorized, verification_type, source_type,
                    anomaly_details, confidence_score, timestamp)
                   VALUES (?, ?, 0, 'AI_FLAG', 'AI_AGENT', ?, 1.0, datetime('now'))""",
                (tag_id, f"[AI FLAG] {tag_id}", reason[:500])
            )
            return f"✅ Identity {tag_id} flagged: '{reason[:100]}'. Log entry created for security review."
        except Exception as e:
            return f"Error flagging identity: {e}"
        finally:
            conn.close()

    return [query_logs, get_risk_summary, flag_identity]
