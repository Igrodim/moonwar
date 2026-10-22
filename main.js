import { initGame, updateCameraTilt, updateCameraAnimation, isGameRunning } from './game.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 30;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

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
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;    
controls.enableRotate = false; 
controls.zoomSpeed = 1.2;
controls.minDistance = 1.5; 
controls.maxDistance = 100; 

initGame(scene, camera, controls);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastFrameTime = 0;
const fpsLimit = 60;
const interval = 1000 / fpsLimit;

function animate(time) {
    requestAnimationFrame(animate);

    // Если мы в меню (игра не началась), полностью останавливаем рендер
    if (!isGameRunning) return;

    const delta = time - lastFrameTime;
    if (delta < interval) return;
    lastFrameTime = time - (delta % interval);

    starMesh.rotation.y += 0.0002; 
    
    updateCameraAnimation(); 
    controls.update();       
    updateCameraTilt();      
    
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);
