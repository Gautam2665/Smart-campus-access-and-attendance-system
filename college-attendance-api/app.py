import subprocess
import sqlite3
import datetime
import logging
import pytz
from flask import Flask, request, jsonify, render_template, send_from_directory, g
from flask_cors import CORS
import os
import io
import json
import math
from auth_middleware import token_required, role_required, permission_required
from database import get_db, query_db, execute_db

app = Flask(__name__)


LOCATION_COORDINATES = {
    "GATE_A": (28.5450, 77.2730),  # Example: Main Gate
    "LAB_1": (28.5455, 77.2735),   # ~70m away
    "HQ_DELHI": (28.6139, 77.2090),
    "WAREHOUSE_NOIDA": (28.5355, 77.3910) # ~20km away
}

def haversine(coord1, coord2):
    """Calculates distance in meters between two lat/lon tuples."""
    R = 6371000  # Earth radius in meters
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def detect_speed_anomaly(tag_id, current_loc_id, current_ts):
    """
    Checks for Credential Sharing (Impossible Travel) or Sprint Anomalies.
    Returns: (is_anomaly, anomaly_type, details)
    """
    try:
        # Get coordinates for current location
        curr_coords = LOCATION_COORDINATES.get(current_loc_id)
        if not curr_coords: return False, None, None

        # Fetch last SUCCESSFUL log for this user
        last_log = query_db("""
            SELECT timestamp, location_id FROM logs 
            WHERE tag_id = ? AND authorized = 1 
            ORDER BY timestamp DESC LIMIT 1
        """, (tag_id,), one=True)
        
        if not last_log: return False, None, None
        
        last_coords = LOCATION_COORDINATES.get(last_log['location_id'])
        if not last_coords: return False, None, None
        
        # Calculate Time Delta (seconds) - Ensure UTC/Local consistency
        # Assuming current_ts is a string '%Y-%m-%d %H:%M:%S'
        fmt = '%Y-%m-%d %H:%M:%S'
        t1 = datetime.datetime.strptime(last_log['timestamp'], fmt)
        t2 = datetime.datetime.strptime(current_ts, fmt)
        
        time_diff = (t2 - t1).total_seconds()
        if time_diff <= 0: return False, None, None # Prevent division by zero
        
        # Calculate Distance (meters)
        dist_diff = haversine(last_coords, curr_coords)
        
        # Calculate Speed (m/s)
        speed = dist_diff / time_diff
        
        # 🚨 THRESHOLDS
        # 1. IMPOSSIBLE TRAVEL (> 55 m/s or ~200 km/h) -> Credential Sharing
        if speed > 55:
            return True, "CREDENTIAL_SHARING", f"Impossible Speed: {speed:.2f} m/s ({dist_diff:.0f}m in {time_diff:.0f}s)"
            
        # 2. SPRINT ANOMALY (> 10 m/s human limit) -> Buddy Punching
        if speed > 10 and dist_diff > 20:
             return True, "IMPOSSIBLE_RUNAWAY", f"Unrealistic Sprint: {speed:.2f} m/s ({dist_diff:.0f}m in {time_diff:.0f}s)"
             
        return False, None, None
        
    except Exception as e:
        print(f"⚠️ Speed Check Error: {e}")
        return False, None, None

# Enhanced CORS to support Azure Static Web Apps and local dev
CORS(app, resources={r"/api/*": {
    "origins": ["http://localhost:5173", "https://zealous-pebble-0f2c98d00.4.azurestaticapps.net"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization"]
}})


# ========================================
# 🔄 DATABASE INITIALIZATION MOVED TO END
# ========================================

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


@app.route('/api/pi/health', methods=['GET'])
def pi_health():
    """Provides system health status for Dashboard."""
    return jsonify({
        "status": "online",
        "daemons": {
            "fingerprint": True,
            "nfc_student": True
        }
    })

def _build_rbac_where_clause(email):
    """
    Returns (where_sql, params) tailored to the user's RBAC tier.
    Used by stats, analytics, and primary log endpoints.
    """
    user_info = query_db("""
        SELECT u.department, r.permissions
        FROM app_users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.email = ?
    """, (email,), one=True)

    permissions = user_info['permissions'].split(',') if user_info and user_info['permissions'] else []
    department = user_info['department'] if user_info else None

    # TIER 1 — GLOBAL
    if 'ALL_ACCESS' in permissions or 'LOGS_VIEW_ALL' in permissions:
        return ("", [])

    # TIER 2 — DEPARTMENT
    elif 'LOGS_VIEW_DEPT' in permissions and department:
        where_sql = """
            l.tag_id IN (
                SELECT 'FIN-' || finger_id AS tag_id FROM faculty WHERE UPPER(department) = UPPER(?)
                UNION
                SELECT t.tag_id FROM tags t 
                LEFT JOIN app_users u2 ON t.email = u2.email 
                WHERE u2.email IS NULL OR UPPER(u2.department) = UPPER(?)
            )
        """
        return (where_sql, [department, department])

    # TIER 3 — PERSONAL
    else:
        where_sql = """
            l.tag_id IN (
                SELECT tag_id FROM tags WHERE email = ?
                UNION
                SELECT 'FIN-' || finger_id FROM faculty WHERE name = (
                    SELECT name FROM app_users WHERE email = ?
                )
            )
        """
        return (where_sql, [email, email])

@app.route('/api/stats', methods=['GET'])
@token_required
def get_stats():
    """Provides counts for Dashboard StatBoxes."""
    try:
        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')
        rbac_where, rbac_params = _build_rbac_where_clause(email)
        
        query = "SELECT authorized, COUNT(*) as count FROM logs l"
        if rbac_where:
            query += f" WHERE {rbac_where}"
        query += " GROUP BY authorized"
        
        data = query_db(query, rbac_params)
        stats = {"authorized": 0, "denied": 0}
        for d in data:
            stats["authorized" if d["authorized"] == 1 else "denied"] = d["count"]
        return jsonify(stats)
    except Exception as e:
        return jsonify({"authorized": 0, "denied": 0, "error": str(e)})

@app.route('/api/attendance/analytics', methods=['GET'])
@token_required
def get_analytics():
    """Aggregates security trends for Dashboard charts."""
    try:
        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')
        rbac_where, rbac_params = _build_rbac_where_clause(email)

        start = request.args.get('start', '2020-01-01')
        end = request.args.get('end', '2030-12-31')
        
        query = """
            SELECT DATE(l.timestamp) as date,
                   SUM(CASE WHEN l.authorized = 1 THEN 1 ELSE 0 END) as authorized,
                   SUM(CASE WHEN l.authorized = 0 THEN 1 ELSE 0 END) as denied
            FROM logs l
            WHERE l.timestamp BETWEEN ? AND ?
        """
        params = [f"{start} 00:00:00", f"{end} 23:59:59"]
        
        if rbac_where:
            query += f" AND ({rbac_where})"
            params.extend(rbac_params)
            
        query += " GROUP BY DATE(l.timestamp) ORDER BY DATE(l.timestamp)"
        
        daily_trends = query_db(query, params)
        return jsonify({"daily_trends": [dict(r) for r in daily_trends], "user_summary": []})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ========================================
# 🔐 AUTH & PROFILE (Dynamic RBAC)
# ========================================
@app.route('/api/auth/me', methods=['GET', 'OPTIONS'])
@token_required
def get_user_profile():
    if request.method == 'OPTIONS': return '', 200
    
    # User info from Azure Token
    user_data = request.user
    email = user_data.get('preferred_username') or user_data.get('email')
    
    # Merge with DB Role
    db_user = query_db("""
        SELECT u.name, u.department, r.name as role_name, r.permissions 
        FROM app_users u 
        JOIN roles r ON u.role_id = r.id 
        WHERE u.email = ?
    """, (email,), one=True)
    
    if db_user:
        profile = {
            "name": db_user['name'],
            "email": email,
            "role": db_user['role_name'],
            "permissions": db_user['permissions'].split(','), # CSV to List
            "department": db_user['department'],
            "source": "database"
        }
    else:
        # Fallback for unassigned users (Guest)
        profile = {
            "name": user_data.get('name'),
            "email": email,
            "role": "Guest",
            "permissions": [],
            "source": "azure_token"
        }
        
    return jsonify(profile)

# ========================================
# 🛡️ ROLE & USER MANAGEMENT (Admin Only)
# ========================================

@app.route('/api/roles', methods=['GET', 'POST', 'OPTIONS'])
@token_required
@permission_required('ROLES_MANAGE') 
def manage_roles():
    if request.method == 'OPTIONS': return '', 200

    if request.method == 'GET':
        roles = query_db("SELECT * FROM roles")
        return jsonify([dict(row) for row in roles])

    if request.method == 'POST':
        data = request.json
        name = data.get('name')
        permissions = data.get('permissions') # CSV string
        
        if not name or not permissions:
            return jsonify({'message': 'Name and Permissions required'}), 400

        try:
            execute_db("INSERT INTO roles (name, permissions) VALUES (?, ?)", (name, permissions))
            return jsonify({'message': 'Role created successfully'}), 201
        except Exception as e:
            return jsonify({'message': f'Error creating role: {str(e)}'}), 500

@app.route('/api/users', methods=['GET', 'POST', 'OPTIONS'])
@token_required
@permission_required('USERS_MANAGE')
def manage_users():
    if request.method == 'OPTIONS': return '', 200

    if request.method == 'GET':
        users = query_db("""
            SELECT u.email, u.name, u.department, r.name as role_name 
            FROM app_users u 
            LEFT JOIN roles r ON u.role_id = r.id
        """)
        return jsonify([dict(row) for row in users])

    if request.method == 'POST':
        # Invite / Bind User to Role
        data = request.json
        email = data.get('email')
        role_id = data.get('role_id')
        name = data.get('name')
        department = data.get('department')

        if not email or not role_id:
            return jsonify({'message': 'Email and Role ID required'}), 400

        try:
            execute_db("""
                INSERT OR REPLACE INTO app_users (email, role_id, name, department) 
                VALUES (?, ?, ?, ?)
            """, (email, role_id, name, department))
            return jsonify({'message': 'User assigned successfully'}), 201
        except Exception as e:
            return jsonify({'message': f'Error assigning user: {str(e)}'}), 500

# ========================================
# 👨‍🎓 STUDENT TAG MANAGEMENT
# ========================================
@app.route('/api/tags', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/api/tags/', methods=['GET', 'POST', 'OPTIONS'])
@token_required
@permission_required('TAGS_MANAGE')
def manage_tags():
    if request.method == 'OPTIONS': return '', 200
    if request.method == 'POST':
        try:
            data = request.json
            tag_id = str(data.get('tag_id')).strip()
            name = data.get('name')
            email = data.get('email')
            department = data.get('department')
            is_active = 1 if data.get('is_active', True) else 0

            if not tag_id or not name or not email: return jsonify({"status": "error", "message": "Missing required fields"}), 400
            
            # Insert into tags
            execute_db("INSERT INTO tags (tag_id, name, email, is_active) VALUES (?, ?, ?, ?)", 
                      (tag_id, name, email, is_active))
            
            # Ensure app_users has this email so RBAC department logic works
            if department:
                existing_user = query_db("SELECT email FROM app_users WHERE email=?", (email,), one=True)
                if not existing_user:
                    execute_db("INSERT INTO app_users (email, name, department) VALUES (?, ?, ?)", (email, name, department))
                else:
                    execute_db("UPDATE app_users SET department=? WHERE email=?", (department, email))
            
            return jsonify({"status": "success", "message": f"Tag {tag_id} registered"}), 201
        except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500
    try:
        tags = query_db("SELECT * FROM tags")
        return jsonify([dict(r) for r in tags])
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/me/tag', methods=['GET', 'OPTIONS'])
@token_required
def get_my_tag():
    """Returns the Tag ID linked to the currently logged-in user."""
    if request.method == 'OPTIONS': return '', 200
    try:
        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')
        
        tag = query_db("SELECT tag_id FROM tags WHERE email = ?", (email,), one=True)
        
        if tag:
            return jsonify({"status": "success", "tag_id": tag['tag_id']})
        else:
            return jsonify({"status": "error", "message": "No tag linked to this account"}), 404
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/tags/<int:id>', methods=['DELETE', 'OPTIONS'])
@token_required
@permission_required('TAGS_MANAGE')
def delete_tag(id):
    if request.method == 'OPTIONS': return '', 200
    try:
        execute_db("DELETE FROM tags WHERE id = ?", (id,))
        return jsonify({"status": "success", "message": "Tag deleted"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/tags/toggle/<int:id>', methods=['PUT', 'POST', 'OPTIONS'])
@token_required
@permission_required('TAGS_MANAGE')
def toggle_tag(id):

    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json
        is_active = 1 if data.get('is_active') is True else 0
        execute_db("UPDATE tags SET is_active = ? WHERE id = ?", (is_active, id))
        return jsonify({"status": "success", "message": f"Tag {id} status updated to {is_active}"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

# ========================================
# 👨‍💼 FACULTY & BIOMETRIC SYNC
# ========================================

@app.route('/api/check', methods=['POST', 'OPTIONS'])
def check_tag():
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json
        tag_id = str(data.get('tag_id')).strip()
        print(f"🔍 Checking Tag: '{tag_id}'")
        tag_info = query_db("SELECT * FROM tags WHERE CAST(tag_id AS TEXT) = ?", (tag_id,), one=True)
        if tag_info:
            if tag_info['is_active'] == 1:
                return jsonify({"status": "success", "name": tag_info['name'], "is_active": True}), 200
            else:
                return jsonify({"status": "error", "message": "Tag is Deactivated"}), 403
        return jsonify({"status": "error", "message": "Unregistered Tag"}), 404
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/hardware/poll', methods=['GET'])
def hardware_poll():
    """Hardware node polls this to check if Azure completed the verification."""
    evidence_key = request.args.get('evidence_key')
    if not evidence_key:
        return jsonify({"status": "error", "message": "Missing evidence_key"}), 400
        
    try:
        # Check if the log exists with this exact evidence key in metadata
        log = query_db("SELECT authorized FROM logs WHERE metadata LIKE ?", (f'%{evidence_key}%',), one=True)
        if log:
            return jsonify({"status": "found", "authorized": int(log['authorized'])}), 200
        return jsonify({"status": "pending"}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/fingerprint/employees', methods=['GET'])
def get_faculty():
    return jsonify([dict(f) for f in query_db("SELECT * FROM faculty")])

@app.route('/api/fingerprint/sync_user', methods=['POST'])
def sync_user():
    data = request.json
    # 🔥 Normalize department to prevent "cs" vs "CS" vs "Computer Science" mismatches
    department = data.get('department', '').strip().upper()
    execute_db("REPLACE INTO faculty (emp_id, name, role, department, finger_id, is_active) VALUES (?, ?, ?, ?, ?, 1)",
        (data['emp_id'], data['name'], data['role'], department, data['finger_id']))
    return jsonify({"status": "success"})

# ========================================
# 🏢 DEPARTMENT MANAGEMENT (Admin)
# ========================================
@app.route('/api/departments', methods=['GET', 'POST', 'OPTIONS'])
@token_required
def manage_departments():
    """GET: List all departments. POST: Create a new one."""
    if request.method == 'OPTIONS': return '', 200
    if request.method == 'GET':
        rows = query_db("SELECT * FROM departments ORDER BY name ASC")
        return jsonify([dict(r) for r in rows])
    if request.method == 'POST':
        data = request.json
        name = data.get('name', '').strip().upper()
        if not name:
            return jsonify({"status": "error", "message": "Department name required"}), 400
        try:
            execute_db("INSERT INTO departments (name) VALUES (?)", (name,))
            return jsonify({"status": "success", "message": f"Department '{name}' created"}), 201
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 409  # Conflict if duplicate

@app.route('/api/departments/<int:dept_id>', methods=['DELETE', 'OPTIONS'])
@token_required
@permission_required('ROLES_MANAGE')
def delete_department(dept_id):
    """Admin-only: Delete a department by ID."""
    if request.method == 'OPTIONS': return '', 200
    execute_db("DELETE FROM departments WHERE id = ?", (dept_id,))
    return jsonify({"status": "success", "message": "Department deleted"})

@app.route('/api/fingerprint/toggle', methods=['POST'])
def toggle_faculty():
    data = request.json
    execute_db("UPDATE faculty SET is_active = ? WHERE emp_id = ?", (1 if data['is_active'] else 0, data['emp_id']))
    return jsonify({"status": "success"})

@app.route('/api/fingerprint/enroll', methods=['POST'])
def enroll_fingerprint():
    # Placeholder for enrollment sync logic
    return jsonify({"status": "success"})

@app.route('/api/attendance', methods=['GET'])
@token_required
def get_attendance():

    try:
        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')

        rbac_where, rbac_params = _build_rbac_where_clause(email)

        base_query = "SELECT l.* FROM logs l"
        where_clauses = []
        params = []

        if rbac_where:
            where_clauses.append(rbac_where)
            params.extend(rbac_params)

        # ==================================================
        # Optional Filters (Dashboard)
        # ==================================================
        source_type = request.args.get('source_type')
        if source_type:
            where_clauses.append("l.source_type LIKE ?")
            params.append(f"%{source_type}%")

        # Combine WHERE clauses
        if where_clauses:
            base_query += " WHERE " + " AND ".join(where_clauses)

        base_query += " ORDER BY l.timestamp DESC LIMIT 200"

        rows = query_db(base_query, params)

        return jsonify([dict(r) for r in rows])

    except Exception as e:
        print(f"❌ ACCESS ERROR: {e}")
        return jsonify({"error": str(e)}), 500



# ============================================================
# 🧠 AI INTELLIGENCE ENDPOINTS (Google Gemini 2.5 via LangChain)
# ============================================================
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
from ai_guardrails import get_guardrail_addendum, redact_logs, post_response_check

def _get_gemini():
    """Returns a LangChain Gemini 2.0 Flash chat model."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set. Get a free key at https://aistudio.google.com/")
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=api_key,
        temperature=0.3,
    )

def _call_gemini(system_prompt: str, user_message: str, temperature: float = 0.3) -> str:
    """Calls Gemini 2.0 Flash via LangChain and returns the text response."""
    llm = _get_gemini()
    llm.temperature = temperature
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]
    response = llm.invoke(messages)
    return response.content

def _strip_json_fences(raw: str) -> str:
    """Strips markdown code fences from LLM JSON responses."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1].lstrip("json").strip() if len(parts) > 1 else cleaned
    return cleaned

def _get_ai_filtered_logs(email, limit=50):
    """3-tier RBAC log fetch reused for all AI endpoints."""
    rbac_where, rbac_params = _build_rbac_where_clause(email)

    base_query = "SELECT l.* FROM logs AS l"
    if rbac_where:
        base_query += f" WHERE {rbac_where}"
        
    base_query += f" ORDER BY l.timestamp DESC LIMIT {limit}"
    rows = query_db(base_query, rbac_params)
    return [dict(r) for r in rows]


@app.route('/api/ai/chat', methods=['POST', 'OPTIONS'])
@token_required
def ai_chat():
    """Conversational BI: natural language → insight about filtered attendance logs."""
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json
        user_query = data.get('query', '').strip()
        if not user_query:
            return jsonify({"error": "Query is required"}), 400

        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')
        user_info = query_db("""
            SELECT u.name, u.department, r.permissions
            FROM app_users u JOIN roles r ON u.role_id = r.id WHERE u.email = ?
        """, (email,), one=True)

        permissions = user_info['permissions'].split(',') if user_info else []
        department = user_info['department'] if user_info else ''
        user_name = user_info['name'] if user_info else email

        logs = _get_ai_filtered_logs(email, limit=100)

        dept_ctx = f"Department: {department}" if department else "Global Access"
        perm_level = ("Global Admin" if ('ALL_ACCESS' in permissions or 'LOGS_VIEW_ALL' in permissions)
                      else "Department Manager" if 'LOGS_VIEW_DEPT' in permissions
                      else "Personal View")

        guardrail = get_guardrail_addendum(permissions, user_name, department)
        system_prompt = f"""You are an AI security analyst for a Smart Campus Access Control System.
User: {user_name} | {dept_ctx} | Access Level: {perm_level}

RULES:
- Only reference the provided log data. Never fabricate entries.
- ALWAYS respond in human-readable formats (short sentences, bullet points, or Markdown tables).
- NEVER output raw database records, comma-separated lists of logs, or JSON dumps.
- If asked for a list of logs, summarize them into a clean Markdown table (Target columns: Time, Name, Status, Result).
- Schema: logs(id, tag_id, name, authorized, timestamp, source_type, department, anomaly_details, confidence_score, location_id)
- If the user asks about data not in the logs, say "That data is outside your access scope."

{guardrail}"""

        redacted_logs = redact_logs(logs)  # PII stripped before LLM sees it
        user_message = f"""LOGS ({len(logs)} records):
{redacted_logs}

QUESTION: {user_query}"""

        raw_answer = _call_gemini(system_prompt, user_message, temperature=0.4)
        answer = post_response_check(raw_answer)  # Output guardrail
        return jsonify({"answer": answer, "log_count": len(logs)})

    except EnvironmentError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"❌ [AI Chat] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/ai/analyze', methods=['POST', 'OPTIONS'])
@token_required
def ai_analyze():
    """Autonomous anomaly detection on the last 50 RBAC-filtered logs."""
    if request.method == 'OPTIONS': return '', 200
    raw = ""
    try:
        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')
        user_info = query_db("""
            SELECT u.department, r.permissions FROM app_users u
            JOIN roles r ON u.role_id = r.id WHERE u.email = ?
        """, (email,), one=True)

        permissions = user_info['permissions'].split(',') if user_info and user_info['permissions'] else []
        department = user_info['department'] if user_info else ''

        logs = _get_ai_filtered_logs(email, limit=50)

        guardrail = get_guardrail_addendum(permissions, user_name="", department=department)
        system_prompt = f"""You are an autonomous AI Security Analyst for a Campus Security System.
Detect threats in the campus access logs provided. Look for:
1. Same tag_id failing 3+ times rapidly (spoofing/tailgating)
2. Access between 10PM–5AM (off-hours)
3. High-confidence denials (possible credential sharing)
4. Multiple failures at the same location in a short window

{guardrail}

Respond ONLY with valid JSON — no markdown fences, no extra text:
{{"threat_level":"LOW|MODERATE|HIGH|CRITICAL","summary":"One sentence.","threats":[{{"type":"SPOOFING_ATTEMPT|TAILGATING|OFF_HOURS|CREDENTIAL_SHARING|ANOMALY_CLUSTER","severity":"LOW|MODERATE|HIGH","description":"...","affected_ids":[],"recommendation":"..."}}],"statistics":{{"total_logs":0,"authorized":0,"denied":0,"anomaly_count":0}}}}"""

        user_message = f"Analyze these {len(logs)} campus access logs:\n{redact_logs(logs)}"
        raw = _call_gemini(system_prompt, user_message, temperature=0.1)
        result = json.loads(_strip_json_fences(raw))
        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify({"threat_level": "UNKNOWN", "summary": raw, "threats": [], "statistics": {}})
    except EnvironmentError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"❌ [AI Analyze] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/ai/risk-scores', methods=['POST', 'OPTIONS'])
@token_required
def ai_risk_scores():
    """Predictive risk scoring per identity using attendance history."""
    if request.method == 'OPTIONS': return '', 200
    raw = ""
    try:
        user_data = request.user
        email = user_data.get('preferred_username') or user_data.get('email')
        user_info = query_db("""
            SELECT u.department, r.permissions FROM app_users u
            JOIN roles r ON u.role_id = r.id WHERE u.email = ?
        """, (email,), one=True)

        permissions = user_info['permissions'].split(',') if user_info and user_info['permissions'] else []
        department = user_info['department'] if user_info else ''

        logs = _get_ai_filtered_logs(email, limit=200)

        guardrail = get_guardrail_addendum(permissions, user_name="", department=department)
        system_prompt = f"""You are a Predictive Security AI for a campus attendance system.
Analyze attendance history per unique tag_id. Score based on: denial frequency, time irregularities, anomaly flags.

{guardrail}

Output ONLY valid JSON — no markdown fences:
{{"risk_profiles":[{{"tag_id":"FIN-21","name":"Name","risk_level":"LOW|MODERATE|HIGH","risk_score":0.0,"reason":"Brief explanation."}}]}}"""

        user_message = f"Score the risk of each identity based on these logs:\n{redact_logs(logs)}"
        raw = _call_gemini(system_prompt, user_message, temperature=0.1)
        result = json.loads(_strip_json_fences(raw))
        return jsonify(result)

    except EnvironmentError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"❌ [AI Risk] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# 📷 PHASE 3 — MULTIMODAL CAMERA ANALYSIS (Gemini 2.5 Pro Vision)
# ============================================================
import base64
import urllib.request

@app.route('/api/ai/analyze-image', methods=['POST', 'OPTIONS'])
@token_required
def ai_analyze_image():
    """
    Phase 3: Gemini 2.5 Pro analyzes a camera anomaly image.
    Payload: { image_url, log_context }
    Returns: { description, threat_assessment, threat_level, confidence, recommendation }
    """
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json or {}
        image_url = data.get('image_url', '').strip()
        log_ctx   = data.get('log_context', {})

        if not image_url:
            return jsonify({"error": "image_url is required"}), 400

        # Fetch image bytes from S3 and base64-encode for Gemini inline part
        try:
            with urllib.request.urlopen(image_url, timeout=8) as resp:
                img_bytes = resp.read()
            img_b64 = base64.b64encode(img_bytes).decode('utf-8')
            mime     = "image/jpeg"
        except Exception as fetch_err:
            return jsonify({"error": f"Could not fetch image: {fetch_err}"}), 502

        # Build gemini-2.5-pro multimodal call (thinking model, 1M context)
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY not set.")

        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import HumanMessage

        pro_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro",
            google_api_key=api_key,
            temperature=0.1,
        )

        anomaly_type = log_ctx.get('verification_type', 'UNKNOWN')
        expected_name = log_ctx.get('name', 'Unknown')
        timestamp = log_ctx.get('timestamp', 'Unknown time')

        msg = HumanMessage(content=[
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{img_b64}"},
            },
            {
                "type": "text",
                "text": f"""You are a Campus Security AI analyzing a camera anomaly image.

Context: 
- Expected person: {expected_name}
- Anomaly type logged: {anomaly_type}
- Timestamp: {timestamp}

Tasks:
1. Describe exactly what you see in the image (people, actions, environment)
2. Assess whether this is a genuine security threat
3. Rate: LOW / MODERATE / HIGH threat
4. Give a confidence score (0.0–1.0) in your assessment
5. Give one specific recommendation for the security officer

Respond ONLY as valid JSON (no markdown):
{{"description":"...","threat_assessment":"...","threat_level":"LOW|MODERATE|HIGH","confidence":0.0,"recommendation":"..."}}"""
            }
        ])

        raw = pro_llm.invoke([msg]).content
        result = json.loads(_strip_json_fences(raw))
        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify({"description": raw, "threat_level": "UNKNOWN", "confidence": 0.0, "recommendation": "Manual review required."}), 200
    except EnvironmentError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"❌ [AI Image] Error: {e}")
        return jsonify({"error": str(e)}), 500



# ============================================================
# 🤖 PHASE 4 — LANGGRAPH REACT AGENT (Autonomous Mission Control)
# ============================================================
from langgraph.prebuilt import create_react_agent
from agent_tools import build_tools

@app.route('/api/ai/agent', methods=['POST', 'OPTIONS'])
@token_required
def ai_agent():
    """
    Phase 4: ReAct agent that autonomously calls tools to complete a security mission.
    Payload:  { mission: str }
    Response: { result: str, steps: [{tool, input, output}] }
    """
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json or {}
        mission = data.get('mission', '').strip()
        if not mission:
            return jsonify({"error": "mission is required"}), 400

        # --- Resolve caller identity & permissions ---
        user_data  = request.user
        email      = user_data.get('preferred_username') or user_data.get('email')
        user_info  = query_db("""
            SELECT u.name, u.department, r.permissions
            FROM app_users u JOIN roles r ON u.role_id = r.id WHERE u.email = ?
        """, (email,), one=True)

        permissions = user_info['permissions'].split(',') if user_info else []
        department  = user_info['department'] if user_info else ''
        user_name   = user_info['name'] if user_info else email

        # --- Build RBAC-scoped tools (each tool opens its own thread-safe DB connection) ---
        tools = build_tools(permissions, department)

        # --- Build LLM ---
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY not set.")

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0.1,
        )

        # --- Guardrail addendum injected as system message ---
        guardrail = get_guardrail_addendum(permissions, user_name, department)
        system_prompt = f"""You are an autonomous Campus Security AI Agent.
User: {user_name} | Department: {department or 'Global'} | Permissions: {', '.join(permissions[:5])}

{guardrail}

INSTRUCTIONS:
- Use your tools to gather data before drawing conclusions.
- Always call query_logs or get_risk_summary to base your findings on real data.
- Use flag_identity only when you find a genuine, evidence-backed threat.
- After completing your investigation, provide a clear summary with bullet points.
- Be concise. Do not fabricate data."""

        # --- Create and run agent (langgraph 0.2.x compatible) ---
        agent = create_react_agent(llm, tools)

        result_messages = agent.invoke({
            "messages": [
                ("system", system_prompt),  # inject guardrail as system message
                ("human", mission),
            ]
        })

        # --- Extract final answer and tool call steps ---
        steps = []
        final_answer = ""

        for msg in result_messages.get("messages", []):
            msg_type = type(msg).__name__

            if msg_type == "AIMessage":
                # Capture tool_calls if any
                if hasattr(msg, 'tool_calls') and msg.tool_calls:
                    for tc in msg.tool_calls:
                        steps.append({
                            "tool": tc.get("name", "unknown"),
                            "input": str(tc.get("args", "")),
                            "output": None  # filled in below
                        })
                if msg.content and not (hasattr(msg, 'tool_calls') and msg.tool_calls):
                    final_answer = msg.content

            elif msg_type == "ToolMessage":
                # Match output back to pending step
                for step in reversed(steps):
                    if step["output"] is None:
                        step["output"] = str(msg.content)[:500]
                        break

        final_answer = post_response_check(final_answer)
        return jsonify({"result": final_answer, "steps": steps})

    except EnvironmentError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        print(f"❌ [AI Agent] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/fingerprint/delete', methods=['DELETE', 'POST', 'OPTIONS'])

@token_required
@permission_required('FINGERPRINT_MANAGE')
def delete_cloud_user():
    """Removes user from Azure DB after Pi hardware delete."""
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json
        emp_id = data.get('emp_id') # Can accept emp_id or finger_id
        finger_id = data.get('finger_id')

        if emp_id:
            execute_db("DELETE FROM faculty WHERE emp_id = ?", (emp_id,))
        elif finger_id:
            execute_db("DELETE FROM faculty WHERE finger_id = ?", (finger_id,))
        else:
            return jsonify({"status": "error", "message": "Missing ID"}), 400
            
        return jsonify({"status": "success", "message": "User removed from Cloud DB"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ========================================
# 🚀 UNIFIED LOGGING (SECURITY SCHEMA)
# ========================================

@app.route('/api/attendance/log_unified', methods=['POST', 'OPTIONS'])
def log_unified():
    if request.method == 'OPTIONS': return '', 200

    data = request.json
    ist = pytz.timezone('Asia/Kolkata')
    ts = datetime.datetime.now(ist).strftime('%Y-%m-%d %H:%M:%S')

    tag_id = data.get('tag_id')
    display_name = data.get('name')
    authorized = int(data.get('authorized', 1)) # Trust payload's decision (Pi/Laptop know best)
    user_role = data.get('user_role', 'STUDENT')
    
    # 📱 Device & Location Logic
    device_id = data.get('device_id')
    location_id = data.get('location_id', 'GATE_A') # Default fallback
    
    if device_id:
        # Check if device exists and get its assigned location
        dev = query_db("SELECT location_id FROM devices WHERE device_id = ?", (device_id,), one=True)
        if dev:
            location_id = dev['location_id']
            # Update last seen
            execute_db("UPDATE devices SET last_seen = ? WHERE device_id = ?", (ts, device_id))
        else:
            # Auto-register new device as 'Unknown'
            execute_db("INSERT OR IGNORE INTO devices (device_id, name, location_id, last_seen) VALUES (?, ?, ?, ?)", 
                       (device_id, f"New Device ({device_id[-4:]})", location_id, ts))

    anomaly_details = data.get('anomaly_details', '')

    # 🛑 PREVENT DUPLICATE LOGS (Idempotency Check)
    # If the same event (evidence_key) is sent by both Laptop and Lambda, only log once.
    metadata = data.get('metadata', {})
    evidence_key = metadata.get('evidence_key')

    if evidence_key:
        # Check if we already have a log with this exact evidence key
        existing_log = query_db("SELECT id FROM logs WHERE metadata LIKE ?", (f'%{evidence_key}%',), one=True)
        if existing_log:
            print(f"♻️ Idempotency: Log for {evidence_key} already exists. Skipping.")
            return jsonify({
                "status": "success", 
                "message": "Log already exists (Idempotent)",
                "authorized": authorized
            })


    # 🏃‍♂️ VELOCITY CHECKS (Impossible Travel / Runaway)
    if authorized == 1:
        is_anomaly, type_anomaly, details_anomaly = detect_speed_anomaly(tag_id, location_id, ts)
        if is_anomaly:
            print(f"🚨 SECURITY ALERT: {type_anomaly} - {details_anomaly}")
            authorized = 0 # Revoke access
            status = "CRITICAL_ANOMALY"
            data['verification_type'] = type_anomaly
            anomaly_details = details_anomaly
            
            # Inject into metadata for Frontend Badges
            metadata['anomaly_type'] = type_anomaly
            metadata['security_note'] = details_anomaly

    # 🔍 SERVER-SIDE IDENTITY RESOLUTION (Stateless Pi Support)
    # If the Pi sends a Finger ID (e.g. FIN-20) instead of a Name, look it up here.
    if tag_id and tag_id.startswith('FIN-'):
        try:
            # Extract Finger ID (e.g. "FIN-20" -> 20)
            fid_str = tag_id.split('-')[1]
            finger_id = int(fid_str)
            
            # Look up in Faculty Table
            faculty_user = query_db("SELECT name, role FROM faculty WHERE finger_id = ?", (finger_id,), one=True)
            
            if faculty_user:
                display_name = faculty_user['name']
                user_role = faculty_user['role']
                print(f"✅ Resolved Identity: {display_name} (Role: {user_role})")
            else:
                display_name = f"Unknown ID ({tag_id})"
                authorized = 0 # Deny access if ID not found in DB
                anomaly_details = "Identity not found in Cloud DB"
                
        except Exception as e:
            print(f"⚠️ Identity Resolution Failed: {e}")
            display_name = "Error Resolving User"
            authorized = 0

    status = 'PENDING' if authorized else 'REVOKED'

    try:
        execute_db("""
            INSERT INTO logs (
                tag_id, name, authorized, timestamp, verification_type, source_type, 
                user_role, confidence_score, metadata, status, location_id, anomaly_details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tag_id, display_name, authorized, ts,
            data.get('verification_type'), data.get('source_type', 'NFC'),
            user_role, data.get('confidence_score', 0.0),
            json.dumps(data.get('metadata', {})),
            status, location_id, anomaly_details
        ))
        
        # Return the resolved name so Pi can display it
        return jsonify({
            "status": "success", 
            "resolved_name": display_name, 
            "resolved_role": user_role,
            "authorized": authorized
        })
    except Exception as e:
        print("🔥 LOG INSERT ERROR:", e)
        return jsonify({"status": "error", "message": str(e)}), 500

# ========================================
# 👮 SMART AUDIT (ASYNC POLLING FLOW)
# ========================================

@app.route('/api/system/flags', methods=['GET'])
def get_system_flags():
    """Laptop Node polls this to see if an Audit is requested."""
    flag = query_db("SELECT * FROM system_flags WHERE key = 'audit_status'", one=True)
    if flag:
        return jsonify({"status": "success", "flag": flag['value']})
    return jsonify({"status": "success", "flag": "IDLE"})

@app.route('/api/audit/trigger', methods=['POST', 'OPTIONS'])
def trigger_audit_request():
    """
    Step 1: Supervisor Scans Finger on Pi.
    Pi calls this -> Sets Flag = 'REQUESTED'.
    Uses a simple API key (X-Device-Key) since Pi hardware can't do Azure OAuth.
    """
    if request.method == 'OPTIONS': return '', 200
    
    # 🔑 Machine-to-Machine Auth: Check for device API key header
    DEVICE_API_KEY = "pi-device-secret-2024"  # Must match what Pi sends
    key = request.headers.get('X-Device-Key') or request.json.get('device_key', '')
    if key != DEVICE_API_KEY:
        return jsonify({"status": "error", "message": "Unauthorized device"}), 403
    
    try:
        data = request.json
        emp_id = data.get('emp_id')

        # Set Flag for Laptop to pick up
        execute_db("INSERT OR REPLACE INTO system_flags (key, value) VALUES ('audit_status', 'REQUESTED')")

        return jsonify({"status": "success", "message": "Audit Requested. Waiting for CCTV..."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/audit/finalize', methods=['POST', 'OPTIONS'])
def finalize_audit():
    """
    Step 3: Laptop process uploaded CCTV count.
    Compares CCTV count vs Pending Logs.
    """
    if request.method == 'OPTIONS': return '', 200
    try:
        data = request.json
        cctv_count = int(data.get('cctv_count', 0))
        
        # Reset Flag
        execute_db("INSERT OR REPLACE INTO system_flags (key, value) VALUES ('audit_status', 'IDLE')")

        # Reconcile Logic
        pending_result = query_db("SELECT count(*) as count FROM logs WHERE status = 'PENDING'", one=True)
        pending_count = pending_result['count']

        status_update = "VERIFIED"
        message = f"Attendance Verified. {pending_count} entries confirmed."
        
        if cctv_count < pending_count:
            message = f"⚠️ Mismatch: {pending_count} Scans vs {cctv_count} People."
            # Here we could mark them as ANOMALY, but for now just verified with warning note
        
        execute_db("UPDATE logs SET status = ?, anomaly_details = ? WHERE status = 'PENDING'", (status_update, message))

        return jsonify({"status": "success", "message": message, "new_status": "IDLE"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ========================================
# 📱 DEVICE MANAGEMENT API
# ========================================

@app.route('/api/devices', methods=['GET', 'POST', 'PUT'])
@token_required
@permission_required('DEVICES_MANAGE')
def manage_devices():
    if request.method == 'POST': # Register/Update
        try:
            data = request.json
            device_id = data.get('device_id')
            name = data.get('name')
            location = data.get('location_id')
            
            execute_db("""
                INSERT INTO devices (device_id, name, location_id) 
                VALUES (?, ?, ?)
                ON CONFLICT(device_id) DO UPDATE SET
                name = excluded.name,
                location_id = excluded.location_id
            """, (device_id, name, location))
            return jsonify({"status": "success", "message": "Device Updated"})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
        
    elif request.method == 'GET': # List
        try:
            devices = query_db("SELECT * FROM devices ORDER BY last_seen DESC")
            return jsonify([dict(d) for d in devices])
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
        
    return jsonify({"error": "Method not allowed"}), 405

@app.route('/api/devices/<string:device_id>', methods=['DELETE', 'OPTIONS'])
@token_required
@permission_required('DEVICES_MANAGE')
def delete_device(device_id):
    if request.method == 'OPTIONS': return '', 200
    try:
        execute_db("DELETE FROM devices WHERE device_id = ?", (device_id,))
        return jsonify({"status": "success", "message": "Device deleted"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/users/<string:email>', methods=['DELETE'])
@token_required
@permission_required('USERS_MANAGE')
def delete_user(email):
    execute_db("DELETE FROM app_users WHERE email = ?", (email,))
    return jsonify({"message": "User deleted"}), 200

@app.route('/api/roles/<int:role_id>', methods=['DELETE'])
@token_required
@permission_required('ROLES_MANAGE')
def delete_role(role_id):
    # Prevent deleting Super Admin or active roles if preferred
    execute_db("DELETE FROM roles WHERE id = ?", (role_id,))
    return jsonify({"message": "Role deleted"}), 200

# ========================================
# 🛠️ DATABASE MANAGEMENT
# ========================================

@app.route('/api/system/reset_logs')
@token_required
@permission_required('ALL_ACCESS')
def reset_logs():
    """HARD RESET: Drops and Recreates Logs Table."""
    try:
        execute_db("DROP TABLE IF EXISTS logs")
        execute_db("""
            CREATE TABLE logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id TEXT, name TEXT, authorized INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                verification_type TEXT, source_type TEXT, user_role TEXT,
                confidence_score REAL, metadata TEXT,
                status TEXT DEFAULT 'PENDING', location_id TEXT DEFAULT 'GATE_A', anomaly_details TEXT
            )
        """)
        return jsonify({"status": "success", "message": "Logs Table Reset with New Security Schema"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/attendance/<int:log_id>', methods=['DELETE', 'OPTIONS'])
@token_required
@permission_required('LOGS_DELETE')
def delete_log(log_id):
    if request.method == 'OPTIONS': return '', 200
    execute_db("DELETE FROM logs WHERE id = ?", (log_id,))
    return jsonify({"status": "success"})

@app.route('/api/setup_db')
def setup_db():
    """Initializes the database and ensures all tables and columns exist."""
    print("🔄 [DB] Checking Schema & Running Migrations...")
    try:
        db = get_db()
        
        # 1. Base Tables Creation
        db.execute("CREATE TABLE IF NOT EXISTS tags (tag_id TEXT PRIMARY KEY, name TEXT, email TEXT, is_active INTEGER DEFAULT 1)")
        db.execute("CREATE TABLE IF NOT EXISTS faculty (emp_id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, finger_id INTEGER, is_active INTEGER DEFAULT 1)")
        db.execute("CREATE TABLE IF NOT EXISTS system_flags (key TEXT PRIMARY KEY, value TEXT)")
        
        # 🛠️ MIGRATION: Add 'department' to 'faculty' if it doesn't exist
        # This fixes the OperationalError: table faculty has no column named department
        try:
            db.execute("ALTER TABLE faculty ADD COLUMN department TEXT")
            print("✅ Migration: Added 'department' column to 'faculty' table.")
        except sqlite3.OperationalError:
            print("ℹ️ Migration: 'department' column already exists in 'faculty'.")

        # 🏢 Departments table (Admin-managed list for consistent naming)
        db.execute("CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)")

        # 🧡 Seed default departments if table is empty
        dept_count = db.execute("SELECT COUNT(*) FROM departments").fetchone()[0]
        if dept_count == 0:
            for dept in ['CS', 'IT', 'MECH', 'CIVIL', 'ETRX', 'ADMIN']:
                db.execute("INSERT OR IGNORE INTO departments (name) VALUES (?)", (dept,))
        
        # 🛠️ MIGRATION: Ensure 'email' exists in 'tags' (for student dash)
        try:
            db.execute("ALTER TABLE tags ADD COLUMN email TEXT")
        except sqlite3.OperationalError:
            pass
            
        # 2. Re-verify other tables (devices, logs, RBAC)
        db.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                device_id TEXT PRIMARY KEY,
                name TEXT,
                location_id TEXT DEFAULT 'Main Gate',
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active INTEGER DEFAULT 1
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id TEXT, name TEXT, authorized INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'verifying',
                anomaly_details TEXT,
                verification_type TEXT, source_type TEXT, user_role TEXT, 
                confidence_score REAL, metadata TEXT, location_id TEXT DEFAULT 'GATE_A'
            )
        """)

        db.execute('''CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            permissions TEXT NOT NULL 
        )''')

        db.execute('''CREATE TABLE IF NOT EXISTS app_users (
            email TEXT PRIMARY KEY,
            role_id INTEGER,
            name TEXT,
            department TEXT,
            FOREIGN KEY(role_id) REFERENCES roles(id)
        )''')
        
        # 3. Seed Admin Data
        admin_role = db.execute("SELECT id FROM roles WHERE name='Super Admin'").fetchone()
        if not admin_role:
            cursor = db.execute("INSERT INTO roles (name, permissions) VALUES (?, ?)", 
                               ('Super Admin', 'ALL_ACCESS'))
            role_id = cursor.lastrowid
        else:
            role_id = admin_role['id']

        my_email = 'gautammulay123@outlook.com'
        existing_user = db.execute("SELECT email FROM app_users WHERE email=?", (my_email,)).fetchone()
        if not existing_user:
            db.execute("INSERT INTO app_users (email, role_id, name, department) VALUES (?, ?, ?, ?)",
                       (my_email, role_id, 'Gautam Mulay', 'IT Admin'))

        db.commit()
        return jsonify({"status": "success", "message": "Database schema and migrations complete."})
    except Exception as e:
        print(f"🔥 [DB] Setup Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/users/<string:email>', methods=['PUT'])
@token_required
@permission_required('USERS_MANAGE')
def update_user(email):
    try:
        data = request.json
        name = data.get('name')
        department = data.get('department')
        role_id = data.get('role_id')

        execute_db("""
            UPDATE app_users
            SET name = ?, department = ?, role_id = ?
            WHERE email = ?
        """, (name, department, role_id, email))

        return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.route('/api/roles/<int:role_id>', methods=['PUT'])
@token_required
@permission_required('ROLES_MANAGE')
def update_role(role_id):
    try:
        data = request.json
        name = data.get('name')
        permissions = data.get('permissions')

        if not name or not permissions:
            return jsonify({"message": "Name and permissions required"}), 400

        execute_db("""
            UPDATE roles
            SET name = ?, permissions = ?
            WHERE id = ?
        """, (name, permissions, role_id))

        return jsonify({"message": "Role updated successfully"}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.route('/api/system/reset_faculty_db')
def reset_faculty_db():
    try:
        execute_db("DELETE FROM faculty")
        return jsonify({"status": "success", "message": "Azure Faculty DB Reset Complete"})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host="0.0.0.0", port=port)