/**
 * Pose.id - App Script
 * Logic: AR Filters -> Multi-Layout Capture -> Layered Editor (BG + Photo + Sticker)
 */

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

// --- 1. KONFIGURASI LAYOUT ---
const config = {
    1: { canvasW: 506, canvasH: 765, photoW: 380, photoH: 550, startY: 100, gap: 0, target: 1 },
    2: { canvasW: 1000, canvasH: 700, photoW: 440, photoH: 550, startY: 75, gap: 460, target: 2, isHorizontal: true },
    3: { canvasW: 591, canvasH: 1773, photoW: 485, photoH: 485, startY: 135, gap: 540, target: 3 },
    4: { canvasW: 1000, canvasH: 1000, photoW: 440, photoH: 440, startY: 50, gap: 460, target: 4 }, // Grid 2x2
    5: { canvasW: 506, canvasH: 765, photoW: 400, photoH: 600, startY: 80, gap: 0, target: 1 }
};

// --- 2. INISIALISASI KAMERA & AR ---
async function startApp() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 }, 
            audio: false 
        });
        video.srcObject = stream;

        video.onloadedmetadata = async () => {
            cameraCanvas.width = arCanvas.width = video.videoWidth;
            cameraCanvas.height = arCanvas.height = video.videoHeight;
            
            await initThreeJS();
            await initFaceMesh();
            loadARFilters();
            renderLoop();
        };
    } catch (err) {
        console.error("Gagal akses kamera:", err);
    }
}

async function initFaceMesh() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: true
    });
}

async function initThreeJS() {
    scene = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(75, video.videoWidth / video.videoHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: arCanvas, alpha: true });
    renderer.setSize(video.videoWidth, video.videoHeight);
    
    const light = new THREE.AmbientLight(0xffffff, 1);
    scene.add(light);
}

// --- 3. LOGIKA FILTER AR ---
function loadARFilters() {
    const container = document.getElementById("arSelector");
    const filters = ["none", "glasses", "cat_ears", "reindeer", "cool_mask"];
    
    filters.forEach(f => {
        const item = document.createElement("div");
        item.className = "ar-thumb";
        item.innerText = f === "none" ? "🚫" : f.toUpperCase();
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.justifyContent = "center";
        
        item.onclick = () => {
            container.querySelectorAll('.ar-thumb').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            applyARModel(f);
        };
        container.appendChild(item);
    });
}

function applyARModel(name) {
    if (filterMesh) scene.remove(filterMesh);
    if (name === "none") return;

    const loader = new THREE.GLTFLoader();
    loader.load(`assets/Ar/${name}.glb`, (gltf) => {
        filterMesh = gltf.scene;
        scene.add(filterMesh);
    });
}

// --- 4. RENDER LOOP (KAMERA + TRACKING) ---
async function renderLoop() {
    // Render Kamera Mirror
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0);
    ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
    ctx2D.restore();

    // Tracking Wajah untuk AR
    if (detector && filterMesh) {
        const faces = await detector.estimateFaces(video);
        if (faces.length > 0) {
            const face = faces[0];
            const corePoint = face.keypoints[1]; // Titik hidung
            
            // Konversi koordinat ke Three.js
            filterMesh.position.x = -(corePoint.x - video.videoWidth / 2) / 10;
            filterMesh.position.y = -(corePoint.y - video.videoHeight / 2) / 10;
            filterMesh.position.z = -50; 
            
            // Rotasi sederhana
            const leftEye = face.keypoints[33];
            const rightEye = face.keypoints[263];
            const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
            filterMesh.rotation.z = -angle;
        }
    }
    
    renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

// --- 5. LOGIKA CAPTURE ---
function changeLayout(l, btn) {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function startCapture() {
    if (isCapturing) return;
    capturedPhotos = [];
    isCapturing = true;
    runCountdown();
}

function runCountdown() {
    let count = 3;
    timerEl.style.display = 'block';
    const timer = setInterval(() => {
        timerEl.innerText = count === 0 ? "📸" : count;
        if (count < 0) {
            clearInterval(timer);
            timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) {
                runCountdown();
            } else {
                isCapturing = false;
                openEditor();
            }
        }
        count--;
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = 480; temp.height = 600;
    const tCtx = temp.getContext("2d");
    
    const sH = cameraCanvas.height;
    const sW = sH * (480 / 600);
    const sX = (cameraCanvas.width - sW) / 2;
    
    // Gabung Kamera + AR ke dalam satu jepretan
    tCtx.drawImage(cameraCanvas, sX, 0, sW, sH, 0, 0, 480, 600);
    tCtx.drawImage(arCanvas, sX, 0, sW, sH, 0, 0, 480, 600);
    
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// --- 6. LOGIKA EDITOR ---
function openEditor() {
    document.getElementById("cameraSection").style.display = "none";
    document.getElementById("editSection").style.display = "block";
    
    // Default Selection
    selectedBg = `assets/background/layout${currentLayout}/bg1.png`;
    selectedSticker = `assets/sticker/layout${currentLayout}/sticker1.png`;
    
    initEditorSelectors('bgSelector', 'background', 'bg');
    initEditorSelectors('stickerSelector', 'sticker', 'sticker');
    updatePreview();
}

function initEditorSelectors(id, folder, prefix) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    for (let i = 1; i <= 200; i++) {
        const img = document.createElement("img");
        const path = `assets/${folder}/layout${currentLayout}/${prefix}${i}.png`;
        img.src = path;
        img.className = "frame-opt";
        img.onclick = function() {
            el.querySelectorAll('img').forEach(node => node.classList.remove('selected'));
            this.classList.add('selected');
            if (prefix === 'bg') selectedBg = path;
            else selectedSticker = path;
            updatePreview();
        };
        img.onerror = () => img.remove();
        el.appendChild(img);
    }
}

async function updatePreview() {
    const canvas = document.getElementById("previewCanvas");
    const ctx = canvas.getContext("2d");
    const conf = config[currentLayout];
    
    canvas.width = conf.canvasW;
    canvas.height = conf.canvasH;

    const loadImg = (src) => new Promise(res => { 
        const i = new Image(); 
        i.onload = () => res(i); 
        i.src = src; 
    });

    // Layer 1: Background
    const bg = await loadImg(selectedBg);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    // Layer 2: Photos
    for (let i = 0; i < capturedPhotos.length; i++) {
        const photo = await loadImg(capturedPhotos[i]);
        let x, y;
        
        if (conf.isHorizontal) {
            x = 50 + (i * conf.gap);
            y = conf.startY;
        } else if (currentLayout == 4) { // Grid 2x2
            x = 50 + (i % 2 * conf.gap);
            y = conf.startY + (Math.floor(i / 2) * conf.gap);
        } else {
            x = (canvas.width - conf.photoW) / 2;
            y = conf.startY + (i * conf.gap);
        }
        ctx.drawImage(photo, x, y, conf.photoW, conf.photoH);
    }

    // Layer 3: Sticker/Overlay
    const sticker = await loadImg(selectedSticker);
    ctx.drawImage(sticker, 0, 0, canvas.width, canvas.height);
}

function downloadFinal() {
    const link = document.createElement('a');
    link.download = 'poseid.png';
    link.href = document.getElementById("previewCanvas").toDataURL();
    link.click();
}

// Jalankan aplikasi
startApp();
