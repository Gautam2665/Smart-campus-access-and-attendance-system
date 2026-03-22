import os
import sqlite3
import datetime
import subprocess
import pytz
import signal
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import time
import sys
# --- CONFIGURATION ---
DATABASE = 'door_cms.db'
app = Flask(__name__)
CORS(app)

# Track background daemon processes
daemons = {
    "fingerprint": None,
    "nfc_student": None
}

# --- PROCESS MANAGEMENT HELPERS ---

def kill_process(name):
    """Robustly kills a process by name."""
    try:
        # SIGKILL directly for fast release
        subprocess.run(["pkill", "-9", "-f", name], stderr=subprocess.DEVNULL)
        time.sleep(0.5)
    except Exception as e:
        print(f"⚠️ Kill error for {name}: {e}")

def force_release_serial():
    """Nuclear option to free /dev/ttyAMA0."""
    try:
        # Kill whatever process is holding the port
        os.system("fuser -k /dev/ttyAMA0 > /dev/null 2>&1")
        time.sleep(1.0) # Hardware needs time to settle
    except: pass

def start_daemons():
    """Nuclear cleanup and fresh start of services."""
    global daemons
    
    print("🧹 cleaning up background processes...")
    kill_process("rfid_service.py")
    kill_process("fingerprint_daemon.py")
    force_release_serial()
    
    time.sleep(2) # Give hardware time to settle

    # 2. Launch using the CURRENT python executable
    python_path = sys.executable 
    
    if not daemons["fingerprint"]:
        print("🚀 Starting Faculty Fingerprint Daemon...")
        daemons["fingerprint"] = subprocess.Popen([python_path, "fingerprint_daemon.py"])
    
    if not daemons["nfc_student"]:
        print("🚀 Starting Student NFC & OLED Service...")
        daemons["nfc_student"] = subprocess.Popen([python_path, "rfid_service.py"])

def stop_fingerprint_daemon():
    """Pauses the fingerprint daemon to free up the UART/Serial port."""
    global daemons
    if daemons["fingerprint"]:
        daemons["fingerprint"].terminate()
        try:
            daemons["fingerprint"].wait(timeout=2)
        except subprocess.TimeoutExpired:
            daemons["fingerprint"].kill()
        daemons["fingerprint"] = None
    
    # Double tap to be sure
    kill_process("fingerprint_daemon.py")
    force_release_serial()
    print("🛑 Fingerprint Daemon Stopped for Exclusive Access")

# --- DATABASE HELPERS ---
def get_db():
    db = sqlite3.connect(DATABASE, detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES)
    db.row_factory = sqlite3.Row
    return db

def execute_db(query, args=()):
    db = get_db()
    cur = db.execute(query, args)
    db.commit()
    db.close()
    return cur.lastrowid

def query_db(query, args=(), one=False):
    db = get_db()
    cur = db.execute(query, args)
    rv = cur.fetchall()
    db.close()
    return (rv[0] if rv else None) if one else rv

# --- FACULTY & FINGERPRINT ENROLLMENT ---
@app.route('/api/fingerprint/enroll', methods=['POST'])
def enroll_fingerprint():
    data = request.json
    # Ensure this matches your Azure URL exactly
    AZURE_SYNC_URL = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net/api/fingerprint/sync_user"

    try:
        # 1. Stop daemon to free the Serial Port
        stop_fingerprint_daemon()
        
        # 2. Run the physical enrollment
        print(f"👉 Starting physical enrollment for {data['name']}...")
        result = subprocess.run(
            ["python3", "fingerprint_enroll.py", str(data['finger_id'])],
            capture_output=True, text=True
        )

        if result.returncode == 0:
            print("✅ Hardware enrollment successful. Syncing to Azure...")
            
            # 3. 🔥 THE CRITICAL SYNC (This is what curl just did)
            sync_response = requests.post(AZURE_SYNC_URL, json=data, timeout=15)
            
            if sync_response.status_code == 200:
                print(f"☁️ Cloud Sync Success for {data['name']}!")
                # Restart is handled in finally block
                return jsonify({"status": "success", "message": "Enrolled and Synced"})
            else:
                print(f"❌ Cloud Sync Failed: {sync_response.status_code}")
                return jsonify({"error": "Hardware OK but Cloud Sync Failed"}), 500
        else:
            print("❌ Hardware enrollment failed (timeout or mismatch)")
            return jsonify({"error": "Hardware enrollment failed"}), 400

    except Exception as e:
        print(f"🔥 Error during enrollment loop: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Always restart the daemon so attendance keeps working
        print("🔄 Restarting Fingerprint Daemon...")
        python_path = sys.executable
        daemons["fingerprint"] = subprocess.Popen([python_path, "fingerprint_daemon.py"])


@app.route('/api/pi/health', methods=['GET'])
def system_health():
    """Checks if background daemons are alive."""
    health_status = {
        "status": "online",
        "daemons": {
            "fingerprint": daemons["fingerprint"].poll() is None if daemons["fingerprint"] else False, # Fix logic: poll() returns None if running
            "nfc_student": daemons["nfc_student"].poll() is None if daemons["nfc_student"] else False
        }
    }
    return jsonify(health_status)


# --- UNIFIED LOGGING (NFC & FINGERPRINT) ---
@app.route('/api/check', methods=['POST'])
def check_nfc():
    """Handles NFC scans for Students."""
    data = request.json
    tag_id = data.get('tag_id')
    ist = pytz.timezone('Asia/Kolkata')
    now = datetime.datetime.now(ist).strftime('%Y-%m-%d %H:%M:%S')

    tag = query_db("SELECT name, is_active FROM tags WHERE tag_id = ?", (tag_id,), one=True)
    
    if tag:
        status = 1 if tag['is_active'] else 0
        execute_db(
            "INSERT INTO logs (tag_id, name, authorized, timestamp, verification_type, source_type, user_role) VALUES (?, ?, ?, ?, 'NFC_ONLY', 'NFC', 'STUDENT')",
            (tag_id, tag['name'], status, now)
        )
        return jsonify({"status": "authorized" if status else "denied", "name": tag['name']})
    
    return jsonify({"status": "denied", "message": "Unknown Tag"}), 403

# NOTICE: /api/fingerprint/verify is REMOVED as it is unused/dead code. 
# fingerprint_daemon.py handles verification directly.

# --- MANAGEMENT API ---
@app.route('/api/fingerprint/employees', methods=['GET'])
def get_faculty():
    return jsonify([dict(r) for r in query_db("SELECT * FROM faculty")])

@app.route('/api/attendance', methods=['GET'])
def get_attendance():
    """Standardized log fetch for the Intelligence Dashboard."""
    rows = query_db("SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100")
    return jsonify([dict(r) for r in rows])

@app.route('/api/fingerprint/toggle', methods=['POST'])
def toggle_faculty():
    data = request.json
    execute_db("UPDATE faculty SET is_active = ? WHERE emp_id = ?", (1 if data['is_active'] else 0, data['emp_id']))
    return jsonify({"status": "success"})

@app.route('/api/fingerprint/delete/<int:fid>', methods=['DELETE', 'OPTIONS'])
def delete_from_sensor(fid):
    if request.method == 'OPTIONS': return '', 200
    
    print(f"🧹 Force Resetting Port and Clearing Slot {fid}")
    try:
        # 1. THE NUCLEAR KILL: Kill process AND clear hardware lock
        stop_fingerprint_daemon()
        time.sleep(2.0) # Give the Pi Zero 2W plenty of time to reset

        import serial
        import adafruit_fingerprint
        
        # 2. Re-establish connection with a fresh buffer
        with serial.Serial("/dev/ttyAMA0", baudrate=57600, timeout=2) as ser:
            ser.reset_input_buffer()
            finger = adafruit_fingerprint.Adafruit_Fingerprint(ser)
            
            # 🔥 CRITICAL: Set the password (default is empty in lib, but we need 0xFF...)
            finger.password = [0xFF, 0xFF, 0xFF, 0xFF]

            if finger.verify_password():
                finger.delete_model(fid)
                print(f"✅ Slot {fid} is now physically empty.")
                return jsonify({"status": "success"}), 200
            else:
                raise Exception("Sensor handshake failed")

    except Exception as e:
        print(f"❌ Delete Failed: {e}")
        # Return a 200 anyway so Azure can finish the job
        return jsonify({"status": "partial_success", "error": str(e)}), 200 
    finally:
        time.sleep(1.0)
        # Restart daemon
        print("🔄 Restarting Fingerprint Daemon...")
        python_path = sys.executable
        daemons["fingerprint"] = subprocess.Popen([python_path, "fingerprint_daemon.py"])


if __name__ == "__main__":
    # Ensure tables exist locally
    execute_db("CREATE TABLE IF NOT EXISTS faculty (emp_id TEXT PRIMARY KEY, name TEXT, role TEXT, department TEXT, finger_id INTEGER, is_active INTEGER)")
    
    # Start the dual background services on boot
    start_daemons()
    
    app.run(host="0.0.0.0", port=5000)