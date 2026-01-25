const video = document.getElementById("camera");
const cameraCanvas = document.getElementById("camera_canvas");
const arCanvas = document.getElementById("ar_canvas");
const timerEl = document.getElementById("timer");
const ctx2D = cameraCanvas.getContext("2d");

let detector, scene, camera3D, renderer, filterMesh;
let currentLayout = 1;
let capturedPhotos = [];
let isCapturing = false;
let selectedBg = "";
let selectedSticker = "";

const TOTAL_FILTERS = 10; 
const PATH_3D = "assets/Ar/";
const PATH_PREVIEW = "assets/Ar/preview/";

const config = {
    1: { canvasW: 506, canvasH: 765, photoW: 380, photoH: 550, startY: 100, gap: 0, target: 1 },
    2: { canvasW: 1000, canvasH: 700, photoW: 440, photoH: 550, startY: 75, gap: 460, target: 2, isHorizontal: true },
    3: { canvasW: 591, canvasH: 1773, photoW: 485, photoH: 485, startY: 135, gap: 540, target: 3 },
    4: { canvasW: 1000, canvasH: 1000, photoW: 440, photoH: 440, startY: 50, gap: 460, target: 4, isGrid: true },
    5: { canvasW: 500, canvasH: 1800, photoW: 400, photoH: 300, startY: 100, gap: 320, target: 5 }
};

// --- 1. INISIALISASI ENGINE 3D (THREE.JS) ---
function initThreeJS() {
    scene = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(50, video.videoWidth / video.videoHeight, 0.1, 1000);
    camera3D.position.z = 5;

    renderer = new THREE.WebGLRenderer({ 
        canvas: arCanvas, 
        alpha: true, 
        preserveDrawingBuffer: true, // WAJIB: Agar hasil foto tidak hitam
        antialias: true 
    });
    renderer.setPixelRatio(window.devicePixelRatio); 
    renderer.setSize(video.videoWidth, video.videoHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(0, 1, 2);
    scene.add(dirLight);
}

// --- 2. INISIALISASI FACE TRACKING (AI) ---
async function initFaceMesh() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: true,
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    });
}

// --- 3. UPDATE POSISI FILTER ---
async function updateFaceTracking() {
    if (!detector || !video || !filterMesh || isCapturing) return;
    
    const faces = await detector.estimateFaces(video, { flipHorizontal: false });

    if (faces.length > 0) {
        const face = faces[0];
        const nose = face.keypoints[1]; 
        
        const x = (nose.x / video.videoWidth) * 2 - 1;
        const y = -(nose.y / video.videoHeight) * 2 + 1;
        
        filterMesh.position.set(x * 3.8, y * 2.8, 0); 
        filterMesh.visible = true;

        const leftEye = face.keypoints[33];
        const rightEye = face.keypoints[263];
        filterMesh.rotation.z = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

        const dist = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2));
        const finalScale = (dist / 100) * 3.5;
        filterMesh.scale.set(finalScale, finalScale, finalScale);
    } else {
        filterMesh.visible = false;
    }
}

// --- 4. START APP ---
async function init() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        video.srcObject = stream;
        
        // Pastikan video benar-benar sudah siap
        video.onloadedmetadata = () => {
            video.play().then(async () => {
                cameraCanvas.width = arCanvas.width = video.videoWidth;
                cameraCanvas.height = arCanvas.height = video.videoHeight;
                initThreeJS();
                await initFaceMesh();
                renderLoop();
            });
        };
    } catch (err) { console.error("Kamera Error:", err); }
}

let lastTracking = 0;
function renderLoop(now) {
    // Pastikan video memiliki data sebelum digambar ke canvas
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx2D.save();
        ctx2D.translate(cameraCanvas.width, 0); 
        ctx2D.scale(-1, 1);
        ctx2D.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
        ctx2D.restore();

        if (now - lastTracking > 30) { 
            updateFaceTracking();
            lastTracking = now;
        }
    }

    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

// --- 5. FILTER SELECTOR ---
window.loadARFilters = (path) => {
    const loader = new THREE.GLTFLoader();
    loader.load(path, (gltf) => {
        if (filterMesh) scene.remove(filterMesh); 
        filterMesh = gltf.scene;
        scene.add(filterMesh);
    }, undefined, (e) => console.error("Load Filter Gagal:", e));
};

window.updateARSelector = () => {
    const el = document.getElementById("arSelector"); 
    if (!el) return;
    el.innerHTML = "";
    for (let i = 1; i <= TOTAL_FILTERS; i++) {
        const img = document.createElement("img");
        img.src = `${PATH_PREVIEW}filter${i}.png`;
        img.className = "asset-thumb";
        img.onclick = () => {
            window.loadARFilters(`${PATH_3D}filter${i}.glb`);
            document.querySelectorAll('#arSelector .asset-thumb').forEach(b => b.classList.remove('selected'));
            img.classList.add('selected');
        };
        el.appendChild(img);
    }
};

// --- 6. CAPTURE & SNAPSHOT (PERBAIKAN TIMER) ---
window.startCapture = () => {
    if (isCapturing || video.readyState < 2) return;
    capturedPhotos = []; 
    isCapturing = true;
    runCountdown();
};

function runCountdown() {
    let count = 3;
    timerEl.style.display = 'block'; // Pastikan muncul
    timerEl.innerText = count;

    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            timerEl.innerText = count;
        } else if (count === 0) {
            timerEl.innerText = "📸";
        } else {
            clearInterval(timer); 
            timerEl.style.display = 'none';
            takeSnapshot();
            
            if (capturedPhotos.length < config[currentLayout].target) {
                // Beri jeda sedikit sebelum foto berikutnya
                setTimeout(runCountdown, 500);
            } else {
                isCapturing = false;
                openEditor();
            }
        }
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = cameraCanvas.width; 
    temp.height = cameraCanvas.height;
    const tCtx = temp.getContext("2d");
    
    // Gambar orang (dari cameraCanvas yang sudah dimirror)
    tCtx.drawImage(cameraCanvas, 0, 0); 
    // Gambar filter (dari arCanvas)
    tCtx.drawImage(arCanvas, 0, 0);      
    
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// --- 7. EDITOR & PREVIEW ---
function openEditor() {
    document.getElementById("cameraSection").style.display = "none";
    document.getElementById("editSection").style.display = "block";
    selectedBg = `assets/background/layout${currentLayout}/bg1.png`;
    selectedSticker = `assets/sticker/layout${currentLayout}/sticker1.png`;
    renderAssetList('bgSelector', 'background', 'bg');
    renderAssetList('stickerSelector', 'sticker', 'sticker');
    updatePreview();
}

function renderAssetList(id, folder, prefix) {

    const el = document.getElementById(id);

    if(!el) return;

    el.innerHTML = "";

    for (let i = 1; i <= 10; i++) {

        const img = document.createElement("img");

        const path = `assets/${folder}/layout${currentLayout}/${prefix}${i}.png`;

        img.src = path; 

        img.className = "asset-thumb";

        img.onclick = () => {

            if (prefix === 'bg') selectedBg = path; else selectedSticker = path;

            updatePreview();

        };

        el.appendChild(img);

    }

}



async function updatePreview() {

    const canvas = document.getElementById("previewCanvas");

    const ctx = canvas.getContext("2d");
