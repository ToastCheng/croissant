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

    sys.stderr.write("Python Video Processor Started\n")
    sys.stderr.flush()

    while True:
        try:
            # 1. Read 4 bytes length (Big Endian)
            length_bytes = sys.stdin.buffer.read(4)
            if not length_bytes or len(length_bytes) < 4:
                break # EOF

            length = struct.unpack('>I', length_bytes)[0]

            # 2. Read 'length' bytes (The JPEG Data)
            # Use a loop to ensure full read
            jpeg_data = b''
            while len(jpeg_data) < length:
                chunk = sys.stdin.buffer.read(length - len(jpeg_data))
                if not chunk:
                    break
                jpeg_data += chunk
            
            if len(jpeg_data) != length:
                continue # Incomplete frame

            # 3. Decode Image
            # Convert bytes to numpy array
            nparr = np.frombuffer(jpeg_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                continue

            # 4. Run Inference
            # stream=True is efficient for video
            results = model.predict(img, verbose=False, classes=[0, 15]) # 0=person, 15=cat

            # 5. Process Results
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

            # 6. Output Result
            # Always print to allow state tracking (absence detection)
            output = {"detections": detections}
            print(json.dumps(output))
            sys.stdout.flush()

        except Exception as e:
            sys.stderr.write(f"Error processing frame: {e}\n")
            sys.stderr.flush()

if __name__ == "__main__":
    main()
