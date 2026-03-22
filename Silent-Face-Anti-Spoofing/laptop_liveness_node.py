
import os
import cv2
import boto3
import numpy as np
from flask import Flask, request
import threading
import time
import requests 
from src.anti_spoof_predict import AntiSpoofPredict
from src.generate_patches import CropImage
from src.utility import parse_model_name
import urllib3
import json

app = Flask(__name__)

# --- Configuration ---
MODEL_DIR = "./resources/anti_spoof_models"
DEVICE_ID = 0  # 0 for integrated laptop webcam
S3_CLIENT = boto3.client('s3', region_name="ap-south-1")
TRIGGER_BUCKET = "facerecognitioniot2"
http = urllib3.PoolManager()

# Azure Base URL (for API calls)
AZURE_BASE = "https://college-attendance-api-h7audmhshuhecqg5.centralindia-01.azurewebsites.net"
AZURE_LOG_URL = f"{AZURE_BASE}/api/attendance/log_unified"

NODE_PORT = 5001
BIOMETRICS_NODE_URL = f"http://0.0.0.0:{NODE_PORT}/trigger"

model_test = AntiSpoofPredict(DEVICE_ID)
image_cropper = CropImage()

# UI State
scan_status = "READY"
latest_cctv_frame = None # Global for CCTV Auditor

# Face Cascade for Counting
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def count_faces_cv2(image):
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        # Reduced strictness to maximize detection (1.1, 3)
        faces = face_cascade.detectMultiScale(gray, 1.1, 3)
        return len(faces)
    except:
        return 0

def analyze_image_quality(image):
    """Calculates brightness and blur to adjust liveness thresholds."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    brightness = np.mean(gray)
    blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
    return brightness, blur_score

def adaptive_liveness_decision(label, score, brightness, blur_score):
    # Preserving User's Custom Logic from Step 1537

    # Force high confidence for real
    STRICT_REAL_THRESHOLD = 0.85  # ⚡ LOWERED to reduce false negatives

    # Hard reject extremely low scores
    if score < 0.65:
        return False, STRICT_REAL_THRESHOLD

    # Lighting adjustments
    if brightness < 60 or brightness > 200:
        STRICT_REAL_THRESHOLD += 0.02

    if blur_score < 40:
        STRICT_REAL_THRESHOLD += 0.03

    # If predicted class is NOT real → reject immediately
    if label != 1:   # assuming class 1 = real
        return False, STRICT_REAL_THRESHOLD

    return score >= STRICT_REAL_THRESHOLD, STRICT_REAL_THRESHOLD


def check_liveness_official(image):
    """Layer 1: Local Anti-Spoofing logic."""
    image_bbox = model_test.get_bbox(image)
    if image_bbox[2] == 0: return False, 0.0

    prediction = np.zeros((1, 3))
    models_found = 0
    for model_name in os.listdir(MODEL_DIR):
        if model_name.endswith(('.pth', '.onnx')):
            models_found += 1
            h_input, w_input, _, scale = parse_model_name(model_name)
            param = {"org_img": image, "bbox": image_bbox, "scale": scale, "out_w": w_input, "out_h": h_input, "crop": True}
            if scale is None: param["crop"] = False
            img = image_cropper.crop(**param)
            prediction += model_test.predict(img, os.path.join(MODEL_DIR, model_name))

    if models_found == 0: return False, 0.0
    label = np.argmax(prediction)
    score = min(1.0, float(prediction[0][label] / models_found))
    brightness, blur_score = analyze_image_quality(image)
    decision, dynamic_threshold = adaptive_liveness_decision(label, score, brightness, blur_score)
    return decision, score

# --- POLLERS --
def poll_cloud_for_result(evidence_key):
    print(f"⏳ Polling Cloud for: {evidence_key}")
    
    # Total patience = 50 seconds, with HYPER-FAST reaction time (0.25s)
    for i in range(200): 
        try:
            # Bypass Azure/Browser caching
            url = f"{AZURE_BASE}/api/hardware/poll?evidence_key={evidence_key}&_t={int(time.time())}"
            r = requests.get(url, timeout=2) # Short timeout for the GET itself
            
            if r.status_code == 200:
                data = r.json()
                if data.get("status") == "found":
                    authorized = data.get("authorized", 0)
                    print(f"✅ Cloud Match Found! Authorized: {authorized}")
                    return authorized == 1
        except Exception:
            pass
        
        # ✅ Faster polling (0.25s) reduces lag significantly
        time.sleep(0.25) 
    
    print("⚠️ Cloud verification timeout")
    return False

def poll_audit_requests():
    """Listens for 'REQUESTED' flag from Cloud to capture CCTV evidence."""
    print("🔄 Audit Poller Started...")
    while True:
        try:
            # Check system flags
            url = f"{AZURE_BASE}/api/system/flags"
            r = requests.get(url, timeout=5)
            if r.status_code == 200:
                flag = r.json().get('flag')
                if flag == 'REQUESTED':
                    print("🚨 AUDIT REQUEST RECEIVED!")
                    # Capture evidence from global CCTV frame
                    evidence_img = latest_cctv_frame
                    
                    count = 0
                    if evidence_img is not None:
                        count = count_faces_cv2(evidence_img)
                        try:
                             # Upload to S3 (audit)
                            _, jpg = cv2.imencode('.jpg', evidence_img)
                            key = f"AUDIT_EVIDENCE_{int(time.time())}.jpg"
                            S3_CLIENT.put_object(
                                Bucket=TRIGGER_BUCKET,
                                Key=key,
                                Body=jpg.tobytes(),
                                ContentType='image/jpeg'
                            )
                        except Exception as e:
                            print(f"Audit Upload Error: {e}")

                    # Finalize
                    requests.post(f"{AZURE_BASE}/api/audit/finalize", json={"cctv_count": count})
                    print(f"✅ Audit Finalized. Count: {count}")
                    
            time.sleep(2)
        except Exception:
            time.sleep(5)

def laptop_cctv_stream():
    """Runs the CCTV Auditor for spatial/room occupancy monitoring."""
    global latest_cctv_frame
    cap = cv2.VideoCapture(0)
    while True:
        ret, frame = cap.read()
        if ret:
            latest_cctv_frame = frame.copy() # Store for audit
            
            # Draw Audit Overlay using lenient count
            count = count_faces_cv2(frame)
            cv2.putText(frame, f"CCTV AUDITOR | Faces: {count}", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.imshow("CCTV MONITOR", frame)
            cv2.moveWindow("CCTV MONITOR", 650, 0)
            
        if cv2.waitKey(1) & 0xFF == ord('q'): break
    cap.release()
    cv2.destroyAllWindows()

@app.route('/trigger', methods=['POST'])
def trigger():
    global scan_status
    try:
        if 'image' not in request.files: return {"status": "error", "message": "No image found"}, 400
        
        tag_id = str(request.form.get('tag_id', 'Unknown'))
        file = request.files['image']
        student_name = request.form.get('name', 'Unknown')
        scan_id = str(int(time.time()))
        
        img_bytes = file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        gatekeeper_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if gatekeeper_img is None: return {"status": "error", "message": "Decode failed"}, 400

        # --- LIVENESS CHECK ---
        is_real, liveness_score = check_liveness_official(gatekeeper_img)
        
        # --- COUNTS ---
        front_count = count_faces_cv2(gatekeeper_img)
        cctv_count = count_faces_cv2(latest_cctv_frame) if latest_cctv_frame is not None else 0
        print(f"🔍 Front Faces: {front_count}, CCTV Faces: {cctv_count}")

        # Metadata
        metadata = {
            'tag_id': tag_id,
            'front_face_count': str(front_count),
            'cctv_count': str(cctv_count),
            'student_name': student_name
        }

        if not is_real:
            scan_status = "SPOOF DETECTED"
            # 🆕 Use 'SPOOF_' prefix to notify AWS Lambda trigger
            unique_key = f"SPOOF_{student_name}_{scan_id}.jpg"
            metadata['anomaly_type'] = 'SPOOF'
            
            S3_CLIENT.put_object(Bucket=TRIGGER_BUCKET, Key=unique_key, Body=img_bytes, ContentType='image/jpeg', Metadata=metadata)
            
            # Return evidence key for Pi
            return {
                "status": "SPOOF", 
                "score": round(liveness_score, 4),
                "evidence_key": unique_key
            }

        # --- SYNC TO CLOUD ---
        scan_status = "SYNCING TO CLOUD..."
        unique_key = f"{student_name}_{scan_id}.jpg"
        S3_CLIENT.put_object(Bucket=TRIGGER_BUCKET, Key=unique_key, Body=img_bytes, ContentType='image/jpeg', Metadata=metadata)
        
        # Poll synchronously (Wait for Azure to update)
        print("⏳ Waiting for Cloud Verification...")
        is_authorized = poll_cloud_for_result(unique_key)

        if is_authorized:
            scan_status = "VERIFIED"
            
            def reset_ui():
                global scan_status
                scan_status = "READY"
            threading.Timer(5.0, reset_ui).start()
            
            return {
                "status": "SUCCESS", 
                "score": round(liveness_score, 4),
                "evidence_key": unique_key
            }
        else:
            scan_status = "IDENTITY MISMATCH"
            return {
                "status": "MISMATCH", 
                "score": round(liveness_score, 4),
                "evidence_key": unique_key # Return key so Pi can log mismatch evidence
            }

    except Exception as e:
        print(f"❌ SERVER ERROR: {str(e)}")
        return {"status": "error", "message": str(e)}, 500

if __name__ == "__main__":
    threading.Thread(target=laptop_cctv_stream, daemon=True).start()
    threading.Thread(target=poll_audit_requests, daemon=True).start() # Added audit poller
    print(f"🚀 Biometrics Node Listening at {BIOMETRICS_NODE_URL}")
    app.run(host='0.0.0.0', port=NODE_PORT, debug=False, threaded=True)