import time
import serial
import adafruit_fingerprint
import sys

# confirmed stable port
UART_PORT = "/dev/ttyAMA0" 
BAUD_RATE = 57600

def init_sensor():
    """Industrial-grade init for AS608 with verified password logic."""
    try:
        uart = serial.Serial(UART_PORT, BAUD_RATE, timeout=2)
        uart.reset_input_buffer()
        uart.reset_output_buffer()
        
        finger = adafruit_fingerprint.Adafruit_Fingerprint(uart)
        time.sleep(1.5)

        # Using the sequence that just worked for you:
        finger.password = [0xFF, 0xFF, 0xFF, 0xFF]

        if finger.verify_password():
            print("✅ AS608 Ready (Library Default)")
            return finger
        return None
    except Exception as e:
        print(f"❌ Init Error: {e}")
        return None

def get_fingerprint_image(finger):
    """Wait and capture a fingerprint image"""
    while True:
        i = finger.get_image()
        if i == adafruit_fingerprint.OK:
            return True
        elif i == adafruit_fingerprint.NOFINGER:
            pass
        elif i == adafruit_fingerprint.IMAGEFAIL:
            print("Imaging error")
            return False
        else:
            print("Other error")
            return False

def enroll(fid):
    finger = init_sensor()
    if not finger:
        print("❌ Sensor password verification failed.")
        sys.exit(1) # CRITICAL: Exit with error code 1 so app.py knows it failed
    
    # --- SCAN 1 ---
    print(f"👉 ID #{fid}: Place finger on sensor...")
    if not get_fingerprint_image(finger):
        sys.exit(1)
    
    print("✅ First scan OK. Templating...")
    # NOTE: image_2_tz expects a slot number (1 or 2). We use 1 for the first scan.
    if finger.image_2_tz(1) != adafruit_fingerprint.OK:
        print("⚠️ Conversion error (1)")
        sys.exit(1)

    print("Remove finger.")
    time.sleep(2)
    while finger.get_image() != adafruit_fingerprint.NOFINGER:
        pass # Wait for finger to be removed

    # --- SCAN 2 ---
    print("👉 Place SAME finger again...")
    if not get_fingerprint_image(finger):
        sys.exit(1)
        
    print("✅ Second scan OK. Templating...")
    if finger.image_2_tz(2) != adafruit_fingerprint.OK:
        print("⚠️ Conversion error (2)")
        sys.exit(1)

    # --- CREATE & STORE ---
    print("Creating model...")
    if finger.create_model() != adafruit_fingerprint.OK:
        print("❌ Scans did not match.")
        sys.exit(1)

    print(f"Storing model #{fid}...")
    if finger.store_model(fid) != adafruit_fingerprint.OK:
        print(f"❌ Store failed in Slot {fid}")
        sys.exit(1)

    print(f"🎉 SUCCESS! Stored at ID {fid}")
    sys.exit(0) # CRITICAL: Exit with 0 so app.py knows it passed

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_id = int(sys.argv[1])
        enroll(target_id)
    else:
        print("Usage: python3 fingerprint_enroll.py <ID>")
        sys.exit(1)
