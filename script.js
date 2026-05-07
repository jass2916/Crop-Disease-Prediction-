const fileInput = document.getElementById('fileInput');
const displayMedia = document.getElementById('displayMedia');
const videoFeed = document.getElementById('videoFeed');
const analyzeBtn = document.getElementById('analyzeBtn');
const canvas = document.getElementById('detectionCanvas');
const ctx = canvas.getContext('2d');
const mediaBox = document.getElementById('mediaBox');

const toggleBtn = document.getElementById('toggleVideo');
let stream = null;

let isCameraActive = false;

toggleBtn.onclick = async () => {
    if (!isCameraActive) {
        try {
            // Request camera access
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }, // Prefers back camera on phones
                audio: false
            });
            videoFeed.srcObject = stream;
            videoFeed.style.display = 'block';
            displayMedia.style.display = 'none';

            isCameraActive = true;
            toggleBtn.innerText = "🛑 Stop Camera";
            toggleBtn.style.background = "#dc3545";
            document.getElementById('status').innerText = "Live Camera Active";
        } catch (err) {
            alert("Camera access denied or not found!");
        }
    } else {
        // Stop the camera
        stream.getTracks().forEach(track => track.stop());
        videoFeed.style.display = 'none';
        isCameraActive = false;
        toggleBtn.innerText = "📷 Start Camera";
        toggleBtn.style.background = "#3498db";
        document.getElementById('status').innerText = "Camera Stopped";
    }
};

// Handle File Selection (Image or Video)
fileInput.onchange = () => {
    const file = fileInput.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    mediaBox.className = 'media-container'; // Reset border
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear boxes

    if (file.type.startsWith('video/')) {
        displayMedia.style.display = 'none';
        videoFeed.style.display = 'block';
        videoFeed.src = url;
        videoFeed.controls = true;
    } else {
        videoFeed.style.display = 'none';
        displayMedia.style.display = 'block';
        displayMedia.src = url;
    }
};

// Analysis Logic
analyzeBtn.onclick = async () => {
    const loader = document.getElementById('loader');
    const status = document.getElementById('status');
    loader.style.display = 'block'; // Start spinning

    let blob;
    let filename;

    if (isCameraActive) {
        // Take a snapshot from the live video
        canvas.width = videoFeed.videoWidth || 640;
        canvas.height = videoFeed.videoHeight || 480;
        ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
        blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg'));
        filename = 'analysis.jpg';
    } else {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file or start camera first!');
            loader.style.display = 'none';
            return;
        }
        blob = file;
        // Preserve the original filename so server can detect video extensions
        filename = file.name || 'upload';
    }

    const formData = new FormData();
    formData.append('file', blob, filename);

    try {
        const resp = await fetch('/predict', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error('Server Error');

        const data = await resp.json();
        drawBox(data.prediction || 'Unknown');
        updateHistory(data.prediction || 'Unknown', data.confidence || 0);
        status.innerText = `Detected: ${data.prediction || 'Unknown'}`;
    } catch (err) {
        console.error(err);
        status.innerText = 'Error analyzing file.';
    } finally {
        loader.style.display = 'none'; // STOP spinning no matter what
    }
};

function drawBox(label) {
    const isHealthy = label.toLowerCase().includes('healthy');
    const mediaBox = document.getElementById('mediaBox');
    const videoFeed = document.getElementById('videoFeed');
    const displayMedia = document.getElementById('displayMedia');
    const canvas = document.getElementById('detectionCanvas');
    const ctx = canvas.getContext('2d');

    // 1. Update UI Border
    mediaBox.className = `media-container ${isHealthy ? 'healthy-border' : 'unhealthy-border'}`;

    // 2. Set Canvas Size based on what is actually visible
    const activeMedia = (videoFeed.style.display !== 'none') ? videoFeed : displayMedia;
    
    // Use offsetWidth/Height to get the real pixel size on screen
    canvas.width = activeMedia.offsetWidth;
    canvas.height = activeMedia.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 3. Draw Frames
    const color = isHealthy ? "#28a745" : "#dc3545";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;

    const iterations = isHealthy ? 1 : 3;
    for (let i = 0; i < iterations; i++) {
        const w = canvas.width * 0.3;
        const h = canvas.height * 0.3;
        // Keep boxes within the center of the leaf
        const x = (canvas.width * 0.2) + (Math.random() * (canvas.width * 0.3));
        const y = (canvas.height * 0.2) + (Math.random() * (canvas.height * 0.3));

        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = color;
        ctx.fillRect(x, y - 25, 130, 25);
        ctx.fillStyle = "white";
        ctx.font = "bold 14px Arial";
        ctx.fillText(isHealthy ? "HEALTHY LEAF" : "DISEASE SPOT", x + 5, y - 8);
    }
    document.getElementById('status').innerText = `Detected: ${label}`;
}

function updateHistory(label, conf) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `<strong>${label}</strong><br><small>${new Date().toLocaleTimeString()}</small>`;
    document.getElementById('historyList').prepend(item);
}