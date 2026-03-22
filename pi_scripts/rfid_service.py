#!/usr/bin/env python3
import time
import requests
import RPi.GPIO as GPIO
import sys
import cv2  # <--- Added OpenCV
from mfrc522 import SimpleMFRC522
from luma.core.interface.serial import i2c
from luma.oled.device import sh1106
from luma.core.render import canvas
from PIL import ImageFont

# ================= CONFIGURATION =================
# Laptop IP for Biometrics (Face/Liveness/S3 Upload)
BIOMETRIC_URL = "http://10.106.251.146:5001/trigger"

# Azure Production URLs
AZURE_BASE = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net"
CHECK_URL = f"{AZURE_BASE}/api/check"
LOG_URL = f"{AZURE_BASE}/api/attendance/log_unified"

# --- RELAY SETUP ---
RELAY_PIN = 27          # BCM pin 27 (physical pin 13)
DOOR_OPEN_SECS = 3      # Seconds to hold relay
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(RELAY_PIN, GPIO.OUT)
GPIO.output(RELAY_PIN, GPIO.HIGH) # Lock door immediately

def pulse_relay(seconds=DOOR_OPEN_SECS):
    try:
        GPIO.output(RELAY_PIN, GPIO.LOW)  # Unlock
        print("🔓 Door Unlocked")
        time.sleep(seconds)
        GPIO.output(RELAY_PIN, GPIO.HIGH) # Lock
        print("🔒 Door Locked")
    except Exception as e:
        print(f"⚠️ Relay Error: {e}")

# ================= HARDWARE SETUP =================
# Lapcare 720p Camera Setup (USB on Pi)
def capture_frame():
    """Captures a 720p frame from the Lapcare USB camera."""
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    
    ret, frame = cap.read()
    cap.release() # Release immediately to save Pi RAM
    
    if ret:
        _, buffer = cv2.imencode('.jpg', frame)
        return buffer.tobytes()
    return None

# OLED Setup (SH1106 via I2C)
try:
    serial = i2c(port=1, address=0x3C)
    device = sh1106(serial)
    font = ImageFont.load_default()
except Exception as e:
    print(f"❌ OLED Initialization Error: {e}")

# NFC Reader Setup
reader = SimpleMFRC522()
GPIO.setwarnings(False)

def display_message(line1, line2="", hold_time=0):
    """Renders text to the SH1106 OLED display."""
    try:
        with canvas(device) as draw:
            draw.rectangle(device.bounding_box, outline=0, fill=0)
            draw.text((0, 10), line1, font=font, fill=255)
            draw.text((0, 30), line2, font=font, fill=255)
        if hold_time > 0:
            time.sleep(hold_time)
    except Exception:
        print(f"CONSOLE: [{line1}] - [{line2}]")

print("🚀 Pi Station Active - Unified NFC + Face Flow")
print(f"🔗 Connected to: {AZURE_BASE}")

try:
    while True:
        display_message("READY", "Scan NFC Tag", hold_time=0)
        
        # 1. READ PHYSICAL TAG
        id, text = reader.read()
        tag_id = str(id).strip()
        print(f"\n🎴 NFC Scanned: {tag_id}")

        # --- STEP 1: AZURE CLOUD AUTHENTICATION ---
        display_message("VERIFYING TAG", "Please wait...")
        try:
            response = requests.post(CHECK_URL, json={"tag_id": tag_id}, timeout=8)
            data = response.json()

            if response.status_code == 200 and data.get("status") == "success":
                user_name = data.get("name", "Student")
                print(f"✅ Azure: {user_name} verified")
                
                # --- STEP 2: CAPTURE AND TRIGGER LAPTOP BIOMETRICS ---
                display_message(f"SMILE {user_name.upper()}", "Capturing...")
                
                # 2a. Capture frame from Lapcare
                img_bytes = capture_frame()
                
                if img_bytes:
                    try:
                        # 2b. Send multipart request to Laptop for Anti-Spoofing
                        files = {'image': ('scan.jpg', img_bytes, 'image/jpeg')}
                        form_data = {'name': user_name, 'tag_id': tag_id}
                        
                        bio_res = requests.post(BIOMETRIC_URL, files=files, data=form_data, timeout=60)
                        bio_data = bio_res.json()
                        
                        status = bio_data.get("status") 
                        score = bio_data.get("score", 0.0)
                        
                        # Note: The actual Identity Match and Log to Azure is now 
                        # handled by the AWS Lambda triggered from the Laptop.
                        if status == "SUCCESS":
                            display_message("VERIFIED", f"Welcome {user_name}", hold_time=2)
                            pulse_relay() # 🔥 TRIGGER RELAY ON VERIFY
                        elif status == "SPOOF":
                            display_message("SPOOF FAIL", "Access Revoked", hold_time=2)
                        else:
                            display_message("AUTH FAIL", "Mismatch", hold_time=2)
                            
                    except Exception as b_err:
                        print(f"⚠️ Biometrics Node Error: {b_err}")
                        display_message("BIO ERROR", "Check Laptop", hold_time=2)
                else:
                    display_message("CAM ERROR", "Check USB Connection", hold_time=2)

            else:
                msg = data.get("message", "Access Denied")
                display_message("DENIED", msg, hold_time=2)

        except Exception as a_err:
            print(f"❌ Cloud Connection Error: {a_err}")
            display_message("AZURE ERROR", "Check Internet", hold_time=2)

        time.sleep(1) 

except KeyboardInterrupt:
    # ⚠️ REMOVED GPIO.cleanup() SO WE DON'T BREAK THE FINGERPRINT DAEMON ⚠️
    print("Stopping RFID Service...")
    sys.exit()
