#!/usr/bin/env python3
import time
import serial
import requests
import adafruit_fingerprint
import uuid
import RPi.GPIO as GPIO
# ---------------- CONFIG ----------------
UART_PORT = "/dev/ttyAMA0" 
BAUD_RATE = 57600

# Azure Production URL
SERVER = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net"
LOG_ENDPOINT = "/api/attendance/log_unified"
AUDIT_ENDPOINT = "/api/audit/trigger"

SCAN_DELAY = 0.3
COOLDOWN = 5 

RELAY_PIN = 27          # BCM pin 27 (physical pin 13)
DOOR_OPEN_SECS = 3      # Seconds to hold relay

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False) # Prevent warnings
GPIO.setup(RELAY_PIN, GPIO.OUT)
GPIO.output(RELAY_PIN, GPIO.HIGH) # Lock door immediately
# ----------------------------------------
def pulse_relay(seconds=3):
    try:
        GPIO.output(RELAY_PIN, GPIO.LOW)  # Unlock
        print("🔓 Door Unlocked")
        time.sleep(seconds)
        GPIO.output(RELAY_PIN, GPIO.HIGH) # Lock
        print("🔒 Door Locked")
    except Exception as e:
        print(f"⚠️ Relay Error: {e}")

def get_mac_address():
    """Returns the MAC address as a unique Device ID."""
    mac = uuid.getnode()
    return ':'.join(("%012X" % mac)[i:i+2] for i in range(0, 12, 2))

def init_sensor():
    """Lean init for AS608 - No template count to avoid attribute errors."""
    try:
        uart = serial.Serial(UART_PORT, BAUD_RATE, timeout=2)
        uart.reset_input_buffer()
        uart.reset_output_buffer()
        
        finger = adafruit_fingerprint.Adafruit_Fingerprint(uart)
        time.sleep(1.5)

        # Using the password that worked in your diagnostic
        finger.password = [0xFF, 0xFF, 0xFF, 0xFF]

        if finger.verify_password():
            print("✅ AS608 SYSTEM ONLINE")
            return finger
        else:
            print("❌ AS608 Security Lock: Verify 5V Power")
            return None
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return None

def trigger_audit(tag_id):
    """Triggers the CCTV Audit via Cloud."""
    payload = {"emp_id": tag_id} 
    try:
        print(f"🕵️ Triggering Audit for {tag_id}...")
        r = requests.post(SERVER + AUDIT_ENDPOINT, json=payload,headers={"X-Device-Key": "pi-device-secret-2024"}, timeout=5)
        print(f"🕵️ Audit Response: {r.status_code} - {r.text}")
    except Exception as e:
        print(f"⚠️ Audit Trigger Failed: {e}")

def send_unified_log(fid, conf):
    """Sends biometric match data to the unified Azure cloud table."""
    payload = {
        "tag_id": f"FIN-{fid}",
        "name": f"Faculty (ID: {fid})",
        "authorized": 1,
        "verification_type": "FINGERPRINT_MATCH",
        "confidence_score": conf / 255.0,  # Normalize for AI Score chip
        "source_type": "FINGERPRINT",
        # 📱 Dynamic Location: Send Device ID so Backend can look up Location
        "device_id": get_mac_address()
    }

    try:
        r = requests.post(SERVER + LOG_ENDPOINT, json=payload, timeout=5)
        
        if r.status_code == 200:
            data = r.json()
            resolved_name = data.get('resolved_name', 'Unknown')
            resolved_role = data.get('resolved_role', 'FACULTY')
            print(f"📤 Cloud Sync Success | Server Identified: {resolved_name} ({resolved_role})")
            
            # 🔥 TRIGGER AUDIT IF LOG SUCCESSFUL
            trigger_audit(f"FIN-{fid}")
            return True
        else:
            print(f"⚠️ Cloud sync failed: {r.status_code} - {r.text}")
            return False
    except Exception as e:
        print(f"⚠️ Cloud sync network error: {e}")
        return False

def main():
    finger = init_sensor()
    if not finger:
        return

    last_id = None
    last_time = 0

    print("🔄 Faculty Biometric Daemon Active")
    print("👉 Waiting for finger...")

    while True:
        try:
            # 1️⃣ Wait for finger
            i = finger.get_image()
            if i == adafruit_fingerprint.NOFINGER:
                time.sleep(SCAN_DELAY)
                continue
            elif i != adafruit_fingerprint.OK:
                print("⚠️ Scanning error")
                time.sleep(0.5)
                continue

            # 2️⃣ Convert image
            if finger.image_2_tz(1) != adafruit_fingerprint.OK:
                print("⚠️ Image conversion failed (remove & retry)")
                time.sleep(0.5)
                continue

            # 3️⃣ SEARCH (✅ correct method)
            if finger.finger_search() != adafruit_fingerprint.OK:
                print("❌ No match found")
                time.sleep(1)
                continue

            # 4️⃣ Read results
            fid = finger.finger_id
            conf = finger.confidence
            now = time.time()

            # 5️⃣ Cooldown protection
            if fid == last_id and (now - last_time < COOLDOWN):
                continue

            print(f"✅ MATCH FOUND: ID {fid} (Confidence: {conf})")


            # Log Attendance & Trigger Audit
            if send_unified_log(fid, conf):
                last_id = fid
                last_time = now
                pulse_relay()
                print("📌 Attendance recorded & Audit Triggered. Remove finger.")
                time.sleep(3)

        except Exception as e:
            print(f"🔥 Runtime error: {e}")
            time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Faculty daemon stopped")
        # Removing `finally: GPIO.cleanup()` to avoid breaking the sensor setup 
        # for `rfid_service.py` running in parallel.
        GPIO.output(RELAY_PIN, GPIO.HIGH)
