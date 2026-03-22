
import requests
import time
import sys

API_URL = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net"
LOG_URL = f"{API_URL}/api/attendance/log_unified"

def print_step(msg):
    print(f"\n👉 {msg}")
    time.sleep(1)

def simulate_log(tag_id, name, location, scenario, delay=0):
    if delay > 0:
        for i in range(delay, 0, -1):
            sys.stdout.write(f"\r⏳ Travel Time: {i}s remaining...")
            sys.stdout.flush()
            time.sleep(1)
        print("")
        
    payload = {
        "tag_id": tag_id,
        "name": name,
        "authorized": 1,
        "location_id": location,
        "device_id": f"SIM_{location}",
        "verification_type": "SIMULATION",
        "metadata": {"evidence_key": f"SIM_{tag_id}_{int(time.time())}.jpg"}
    }
    
    try:
        r = requests.post(LOG_URL, json=payload, timeout=5)
        if r.status_code == 200:
            data = r.json()
            if data.get('authorized') == 0:
                print(f"❌ [BLOCKED] System detected: {data.get('message', 'Security Alert')}")
                print(f"   Reason: {data.get('resolved_role', 'Unknown')} attempted {scenario}")
            else:
                print(f"✅ [ALLOWED] {name} logged in at {location}")
        else:
            print(f"⚠️ Error: {r.text}")
    except Exception as e:
        print(f"❌ Network Error: {e}")

print("\n🔒 COLLEGE ATTENDANCE - THREAT SIMULATION")
print("🎯 Target: " + API_URL)
print("="*60)

# SCENARIO 1: CREDENTIAL SHARING
print("\n[SCENARIO 1] CREDENTIAL SHARING (Teleportation)")
print_step("Alice (Manager) scans her card at HQ_DELHI.")
simulate_log("CS_USER_01", "Alice Manager", "HQ_DELHI", "Normal Entry")

print_step("Simulating Credential Handover to Accomplice...")
print_step("Accomplice attempts to use Alice's ID at WAREHOUSE_NOIDA (20km away).")
simulate_log("CS_USER_01", "Alice Manager", "WAREHOUSE_NOIDA", "CREDENTIAL_SHARING", delay=3)

print("="*60)

# SCENARIO 2: IMPOSSIBLE SPRINT
print("\n[SCENARIO 2] IMPOSSIBLE SPRINT (Ghost Entry)")
print_step("Bob (Intern) enters GATE_A.")
simulate_log("RUN_USER_02", "Bob Intern", "GATE_A", "Normal Entry")

print_step("Bob allegedly sprints to LAB_1 (70m away) in record time.")
simulate_log("RUN_USER_02", "Bob Intern", "LAB_1", "IMPOSSIBLE_RUNAWAY", delay=2)

print("\n="*60)
print("✅ DEMO COMPLETE. Check 'Camera Anomalies' Dashboard.")
