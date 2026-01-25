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
    2: { canvasW: 1000, canvasH: 700, photoW: 440, photoH: 550, startY: 75, gap: 460, target: 2 },
    3: { canvasW: 591, canvasH: 1773, photoW: 485, photoH: 485, startY: 135, gap: 540, target: 3 },
    4: { canvasW: 1000, canvasH: 1000, photoW: 440, photoH: 440, startY: 50, gap: 460, target: 4 },
    5: { canvasW: 500, canvasH: 1800, photoW: 400, photoH: 300, startY: 100, gap: 320, target: 5 }
};

// --- 1. INISIALISASI ---
async function init() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 } 
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            cameraCanvas.width = arCanvas.width = video.videoWidth;
            cameraCanvas.height = arCanvas.height = video.videoHeight;
            initThreeJS();
            renderLoop();
            window.updateARSelector();
            initFaceMesh();
        };
    } catch (err) { console.error("Kamera Error:", err); }
}

function initThreeJS() {
    scene = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(50, video.videoWidth / video.videoHeight, 0.1, 1000);
    camera3D.position.z = 5;
    renderer = new THREE.WebGLRenderer({ canvas: arCanvas, alpha: true, preserveDrawingBuffer: true, antialias: true });
    renderer.setSize(video.videoWidth, video.videoHeight);
    scene.add(new THREE.AmbientLight(0xffffff, 2.0));
}

async function initFaceMesh() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs', refineLandmarks: true,
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    });
}

// --- 2. RENDER LOOP ---
function renderLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx2D.save();
        ctx2D.translate(cameraCanvas.width, 0);
        ctx2D.scale(-1, 1);
        ctx2D.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
        ctx2D.restore();
        if (detector && filterMesh && !isCapturing) updateFaceTracking();
    }
    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

async function updateFaceTracking() {
    const faces = await detector.estimateFaces(video, { flipHorizontal: false });
    if (faces.length > 0) {
        const face = faces[0];
        const nose = face.keypoints[1];
        const x = (nose.x / video.videoWidth) * 2 - 1;
        const y = -(nose.y / video.videoHeight) * 2 + 1;
        filterMesh.position.set(x * 3.8, y * 2.8, 0);
        filterMesh.visible = true;
        const leftEye = face.keypoints[33], rightEye = face.keypoints[263];
        filterMesh.rotation.z = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
        const dist = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2));
        const finalScale = (dist / 100) * 3.5;
        filterMesh.scale.set(finalScale, finalScale, finalScale);
    } else if (filterMesh) filterMesh.visible = false;
}

// --- 3. CAPTURE & SNAPSHOT ---
window.startCapture = () => {
    if (isCapturing || video.readyState < 2) return;
    capturedPhotos = []; isCapturing = true;
    runCountdown();
};

function runCountdown() {
    let count = 3;
    timerEl.innerText = count;
    timerEl.style.display = 'block';
    const timer = setInterval(() => {
        count--;
        if (count > 0) { timerEl.innerText = count; } 
        else if (count === 0) { timerEl.innerText = "📸"; } 
        else {
            clearInterval(timer);
            timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) runCountdown();
            else { isCapturing = false; openEditor(); }
        }
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = cameraCanvas.width; temp.height = cameraCanvas.height;
    const tCtx = temp.getContext("2d");
    tCtx.drawImage(cameraCanvas, 0, 0);
    tCtx.drawImage(arCanvas, 0, 0);
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// --- 4. EDITOR & ASSET LIST (FUNGSI YANG KAMU CARI) ---
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
    const conf = config[currentLayout];
    canvas.width = conf.canvasW; canvas.height = conf.canvasH;

    const loadImg = (src) => new Promise(res => {
        const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
    });

    const bg = await loadImg(selectedBg);
    if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    for (let i = 0; i < capturedPhotos.length; i++) {
        const p = await loadImg(capturedPhotos[i]);
        if (p) {
            let x = (canvas.width - conf.photoW) / 2;
            let y = conf.startY + (i * conf.gap);
            ctx.drawImage(p, x, y, conf.photoW, conf.photoH);
        }
    }

    const st = await loadImg(selectedSticker);
    if (st) ctx.drawImage(st, 0, 0, canvas.width, canvas.height);
}

// --- 5. OTHERS ---
window.loadARFilters = (path) => {
    new THREE.GLTFLoader().load(path, (gltf) => {
        if (filterMesh) scene.remove(filterMesh);
        filterMesh = gltf.scene; scene.add(filterMesh);
    });
};

window.updateARSelector = () => {
    const el = document.getElementById("arSelector");
    if (!el) return;
    el.innerHTML = "";
    for (let i = 1; i <= TOTAL_FILTERS; i++) {
        const img = document.createElement("img");
        img.src = `${PATH_PREVIEW}filter${i}.png`;
        img.className = "asset-thumb";
        img.onclick = () => window.loadARFilters(`${PATH_3D}filter${i}.glb`);
        el.appendChild(img);
    }
};

window.downloadFinal = () => {
    const canvas = document.getElementById("previewCanvas");
    const link = document.createElement('a');
    link.download = `Poseid_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
};

window.setLayout = (l, btn) => {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

document.addEventListener("DOMContentLoaded", init);
