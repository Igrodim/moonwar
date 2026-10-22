import { createPlanet } from './planet.js';
import { initGame, updateCameraTilt } from './game.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

// --- УЛУЧШЕННЫЙ СВЕТ ---
// Немного синеватый фоновый свет для космической атмосферы
const ambientLight = new THREE.AmbientLight(0x1a1a3a, 1.2); 
scene.add(ambientLight);

// Основной направленный свет (как от далекой звезды)
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5); 
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// --- ЗВЕЗДНЫЙ ФОН (STARFIELD) ---
const starsGeometry = new THREE.BufferGeometry();
const starsCount = 5000;
const posArray = new Float32Array(starsCount * 3);

for (let i = 0; i < starsCount * 3; i++) {
    // Раскидываем звезды по огромной сфере вокруг сцены
    posArray[i] = (Math.random() - 0.5) * 200; 
}

starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

const starsMaterial = new THREE.PointsMaterial({
    size: 0.15,
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending // Звезды будут красиво светиться
});

const starMesh = new THREE.Points(starsGeometry, starsMaterial);
scene.add(starMesh);

// --- ОСТАЛЬНАЯ ЛОГИКА ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;    
controls.enableRotate = false; 
controls.zoomSpeed = 1.2;
controls.minDistance = 1.5; 
controls.maxDistance = 25; 

createPlanet(scene);
initGame(scene, camera, controls);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    
    // Медленное вращение звезд для эффекта полета
    starMesh.rotation.y += 0.0001; 
    
    controls.update();       
    updateCameraTilt();      
    
    renderer.render(scene, camera);
}
animate();
