import { createPlanet } from './planet.js';
import { initGame } from './game.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.25); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.5); 
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;    // Отключаем сдвиг
controls.enableRotate = false; // ОТКЛЮЧАЕМ ВРАЩЕНИЕ МЫШЬЮ
controls.zoomSpeed = 1.2;
controls.minDistance = 0.1; 
controls.maxDistance = 30; 

createPlanet(scene);
initGame(scene, camera, controls);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (camera.position.length() < 10.02) {
        camera.position.setLength(10.02);
    }
    renderer.render(scene, camera);
}
animate();
