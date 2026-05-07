import cv2
import os
import json
import numpy as np
from flask import Flask, request, jsonify, render_template
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image

app = Flask(__name__)

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# --- Load Model & Labels ---
MODEL_PATH = 'model/agriscience_final_model.h5'
JSON_PATH = 'model/class_indices (1).json'

with open(JSON_PATH, 'r') as f:
    indices = json.load(f)
    # FIX: Correctly map Integer Index -> Class Name
    # Kaggle JSONs are {"ClassName": Index}, so we swap them:
    labels = {v: k for k, v in indices.items()}

model = load_model(MODEL_PATH)

def get_prediction(img_path, is_opencv_frame=False):
    """Processes image and returns results with a safety threshold"""
    if is_opencv_frame:
        # FIX: OpenCV is BGR, Keras needs RGB. 
        img = cv2.imread(img_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (224, 224))
        img_array = image.img_to_array(img)
    else:
        img = image.load_img(img_path, target_size=(224, 224))
        img_array = image.img_to_array(img)
    
    img_array = np.expand_dims(img_array, axis=0) / 255.0
    
    preds = model.predict(img_array)
    pred_idx = np.argmax(preds[0])
    confidence = float(np.max(preds[0]))

    # FIX: Confidence Threshold
    # If the model is unsure, it shouldn't guess a scary disease.
    if confidence < 0.45:
        return "Healthy / Unclear (Low Confidence)", confidence
    
    return labels.get(pred_idx, "Unknown"), confidence

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        filepath = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(filepath)

        filename = file.filename.lower()
        is_video = filename.endswith(('.mp4', '.avi', '.mov', '.mkv'))

        if is_video:
            cap = cv2.VideoCapture(filepath)
            # Skip first 10 frames to ensure camera focus/lighting is stable
            for _ in range(10): cap.read()
            success, frame = cap.read()
            cap.release()

            if not success:
                return jsonify({"error": "Video frame extraction failed"}), 400

            frame_path = os.path.join(UPLOAD_FOLDER, "temp_capture.jpg")
            cv2.imwrite(frame_path, frame)
            
            # Use the OpenCV-specific processing (RGB fix)
            result, confidence = get_prediction(frame_path, is_opencv_frame=True)
            os.remove(frame_path)
        else:
            result, confidence = get_prediction(filepath)

        return jsonify({
            "prediction": result,
            "confidence": confidence
        })

    except Exception as e:
        print(f"Backend Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)