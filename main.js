import { initGame, updateCameraTilt, updateCameraAnimation } from './game.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 30;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
renderer.domElement.style.display = 'none'; 
document.body.appendChild(renderer.domElement);

// ПАНЕЛЬ ПРОФИЛИРОВАНИЯ (Включается на клавишу P)
const infoPanel = document.createElement('div');
infoPanel.style.cssText = 'position:absolute; top:10px; right:10px; color:#0f0; font-family:monospace; font-size:12px; background:rgba(0,0,0,0.5); padding:5px; z-index:1000; display:none;';
document.body.appendChild(infoPanel);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); 
dirLight.position.set(5, 3, 5); 
scene.add(dirLight);

const starsGeometry = new THREE.BufferGeometry();
const starsCount = 2000; 
const posArray = new Float32Array(starsCount * 3);
for (let i = 0; i < starsCount * 3; i++) { posArray[i] = (Math.random() - 0.5) * 200; }
starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const starsMaterial = new THREE.PointsMaterial({ size: 0.15, color: 0xffffff, transparent: true, opacity: 0.8 });
const starMesh = new THREE.Points(starsGeometry, starsMaterial);
scene.add(starMesh);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.05;
controls.enablePan = false; controls.enableRotate = false; 
controls.zoomSpeed = 1.2; controls.minDistance = 1.5; controls.maxDistance = 100; 

initGame(scene, camera, controls);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// АДАПТИВНОЕ КАЧЕСТВО
let lastFrameTime = 0;
const fpsLimit = 60;
const interval = 1000 / fpsLimit;
let isLoopRunning = false; 
let frameCount = 0;
let fps = 0;
let lastFpsUpdate = 0;
let currentPixelRatio = 1.25;

function animate(time) {
    if (!isLoopRunning) return; 
    requestAnimationFrame(animate);

    const delta = time - lastFrameTime;
    if (delta < interval) return;
    lastFrameTime = time - (delta % interval);

    frameCount++;
    if (time - lastFpsUpdate >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFpsUpdate = time;
        
        // Если FPS падает ниже 45, снижаем качество
        if (fps < 45 && currentPixelRatio > 0.75) {
            currentPixelRatio -= 0.25;
            renderer.setPixelRatio(currentPixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
        } else if (fps > 58 && currentPixelRatio < 1.25) {
            currentPixelRatio += 0.05;
            renderer.setPixelRatio(currentPixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    starMesh.rotation.y += 0.0002; 
    updateCameraAnimation(); 
    controls.update();       
    updateCameraTilt();      
    renderer.render(scene, camera);
}

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
        infoPanel.style.display = infoPanel.style.display === 'none' ? 'block' : 'none';
    }
});

window.addEventListener('startGameRender', () => {
    renderer.domElement.style.display = 'block'; 
    if (!isLoopRunning) {
        isLoopRunning = true;
        requestAnimationFrame(animate);
    }
});

setInterval(() => {
    if (infoPanel.style.display === 'block') {
        const info = renderer.info.render;
        infoPanel.innerHTML = `FPS: ${fps}<br>Draw Calls: ${info.calls}<br>Triangles: ${info.triangles}<br>PixelRatio: ${currentPixelRatio.toFixed(2)}`;
    }
}, 200);
