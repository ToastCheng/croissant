import sys
import struct
import json
import numpy as np
import cv2
from ultralytics import YOLO

def main():
    # Load model once
    try:
        # Using nano model for speed
        model = YOLO("yolo11n.pt")
    except Exception as e:
        sys.stderr.write(f"Error loading model: {e}\n")
        sys.stderr.flush()
        return

    sys.stdout.write("Python Video Processor Started\n")
    sys.stdout.flush()

    while True:
        try:
            # 1. Read 4 bytes length (Big Endian)
            length_bytes = sys.stdin.buffer.read(4)
            if not length_bytes or len(length_bytes) < 4:
                break # EOF

            total_length = struct.unpack('>I', length_bytes)[0]

            # 2. Read full payload
            payload = b''
            while len(payload) < total_length:
                chunk = sys.stdin.buffer.read(total_length - len(payload))
                if not chunk:
                    break
                payload += chunk
            
            if len(payload) != total_length:
                continue # Incomplete frame

            # 3. Parse Payload
            # Format: [1 byte ID Len][Source ID][Image Data]
            id_len = payload[0]
            source_id = payload[1:1+id_len].decode('utf-8')
            jpeg_data = payload[1+id_len:]

            # 4. Decode Image
            nparr = np.frombuffer(jpeg_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                continue

            # 5. Run Inference
            results = model.predict(img, verbose=False, classes=[0, 15], imgsz=320) # 0=person, 15=cat

            # 6. Process Results
            detections = []
            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    label = model.names[cls_id]
                    
                    if conf > 0.5: # Confidence threshold
                        detections.append({
                            "label": label,
                            "confidence": conf,
                            "box": box.xywh.tolist()[0] # [x, y, w, h]
                        })

            # 7. Output Result with Source ID
            output = {
                "source": source_id,
                "detections": detections
            }
            print(json.dumps(output))
            sys.stdout.flush()

        except Exception as e:
            sys.stderr.write(f"Error processing frame: {e}\n")
            sys.stderr.flush()

if __name__ == "__main__":
    main()
