// Menggunakan variabel global sesuai struktur sebelumnya
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const bgSelector = document.getElementById("bgSelector"); // Selector untuk background
const stickerSelector = document.getElementById("stickerSelector"); // Selector untuk sticker/frame

let photos = [];
let currentLayout = "1";
let selectedBg = new Image();
let selectedSticker = new Image();

// --- 1. LIVE PREVIEW (FIX MIRROR & CROP) ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (video.videoWidth > 0) {
        // Logika Center Crop agar foto mentahan tidak kepotong
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvas.width / canvas.height;
        let sx, sy, sw, sh;

        if (videoAspect > canvasAspect) {
            sh = video.videoHeight;
            sw = sh * canvasAspect;
            sx = (video.videoWidth - sw) / 2;
            sy = 0;
        } else {
            sw = video.videoWidth;
            sh = sw / canvasAspect;
            sx = 0;
            sy = (video.videoHeight - sh) / 2;
        }

        // --- LAYER 1: BACKGROUND ---
        if (selectedBg.src) {
            ctx.drawImage(selectedBg, 0, 0, canvas.width, canvas.height);
        }

        // --- LAYER 2: VIDEO (MIRROR) ---
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1); // Membalik kamera secara horizontal agar seperti cermin
        
        // Gambar Video Mentahan
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        
        // --- LAYER 3: AR FILTER ---
        if (typeof renderAR3D === "function") {
            renderAR3D(ctx);
        }
        
        // --- LAYER 4: STICKER / FRAME ---
        if (selectedSticker.src) {
            ctx.drawImage(selectedSticker, 0, 0, canvas.width, canvas.height);
        }
    }
    requestAnimationFrame(draw);
}

// Inisialisasi Kamera
function initApp() {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                canvas.width = 480; 
                canvas.height = 640;
                // Panggil init AR jika ada
                if (typeof initAR3D === "function") initAR3D(video, canvas);
                draw();
            };
        })
        .catch((err) => console.error("Kamera error:", err));
}

// --- 2. LOGIKA PILIH BACKGROUND & STICKER TERPISAH ---

// Fungsi render daftar Background
function loadBackgrounds(layout) {
    if (!bgSelector) return;
    bgSelector.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
        const img = document.createElement("img");
        img.src = `assets/background/layout${layout}/bg${i}.png`;
        img.className = "asset-thumb";
        img.onclick = () => {
            selectedBg.src = img.src;
            document.querySelectorAll('#bgSelector .asset-thumb').forEach(el => el.classList.remove('active'));
            img.classList.add('active');
        };
        bgSelector.appendChild(img);
    }
}

// Fungsi render daftar Sticker
function loadStickers(layout) {
    if (!stickerSelector) return;
    stickerSelector.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
        const img = document.createElement("img");
        img.src = `assets/sticker/layout${layout}/sticker${i}.png`;
        img.className = "asset-thumb";
        img.onclick = () => {
            selectedSticker.src = img.src;
            document.querySelectorAll('#stickerSelector .asset-thumb').forEach(el => el.classList.remove('active'));
            img.classList.add('active');
        };
        stickerSelector.appendChild(img);
    }
}

// Event untuk tombol layout
document.querySelectorAll(".l-btn").forEach(btn => {
    btn.onclick = () => {
        currentLayout = btn.getAttribute("data-val") || btn.value;
        const layoutNum = currentLayout.replace('v', '');
        
        // Update pilihan asset sesuai layout
        loadBackgrounds(layoutNum);
        loadStickers(layoutNum);
        
        document.querySelectorAll('.l-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };
});

// --- 3. SNAPSHOT & DOWNLOAD ---

document.getElementById("snap").onclick = () => {
    // Simpan hasil canvas (gabungan BG + Video Mirror + Sticker)
    const dataURL = canvas.toDataURL("image/png");
    photos.push(dataURL);
    
    // Tampilkan tombol download
    const dlBtn = document.getElementById("download");
    if (dlBtn) dlBtn.style.display = "block";
    
    alert(`Foto ${photos.length} tersimpan!`);
};

document.getElementById("download").onclick = () => {
    // Jika lo pake file export.js terpisah, panggil fungsinya di sini
    if (typeof exportImage === "function") {
        const layoutConfig = layouts[currentLayout];
        exportImage(photos, layoutConfig);
    } else {
        // Download sederhana jika export.js tidak ada
        const link = document.createElement('a');
        link.download = 'poseid.png';
        link.href = photos[photos.length - 1];
        link.click();
    }
};

// Start
initApp();
loadBackgrounds("1");
loadStickers("1");
