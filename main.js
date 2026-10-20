import { createPlanet } from './planet.js';
import { initGame } from './game.js';

// 1. Сцена, камера, рендерер
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e, 1);
document.body.appendChild(renderer.domElement);

// 2. Освещение
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1); 
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// 3. Управление камерой
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = 1.2;
controls.minDistance = 0.1; 
controls.maxDistance = 30; 

// 4. Создаем планету (вызываем функцию из planet.js)
createPlanet(scene);

// 5. Запускаем игровую логику (вызываем функцию из game.js)
initGame(scene, camera, controls);

// 6. Обработка ресайза окна
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 7. Анимация
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Защита от проваливания
    if (camera.position.length() < 10.02) {
        camera.position.setLength(10.02);
    }
    
    renderer.render(scene, camera);
}
animate();
