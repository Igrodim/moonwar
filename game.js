// 1. Сцена, камера, рендерер
const scene = new THREE.Scene();
// near = 0.01 чтобы камера не прорезала текстуру при сильном приближении
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e, 1);
document.body.appendChild(renderer.domElement);

// 2. Свет
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1); 
dirLight.position.set(5, 3, 5);
scene.add(dirLight);

// 3. Текстура
const textureLoader = new THREE.TextureLoader();
// Если ты переименовал свою картинку, убедись, что здесь правильное имя
const moonTexture = textureLoader.load('moon.jpg');

// 4. Планета (УВЕЛИЧИЛИ ПЛОТНОСТЬ ДО 128)
const globeGeometry = new THREE.SphereGeometry(10, 128, 128); 
const globeMaterial = new THREE.MeshStandardMaterial({ map: moonTexture });
const globe = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globe);

// 5. Сетка (УВЕЛИЧИЛИ ПЛОТНОСТЬ И СДЕЛАЛИ НЕВИДИМОЙ)
const gridGeometry = new THREE.SphereGeometry(10.01, 128, 128); 
const gridMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x4a4a6a, 
    wireframe: true,
    transparent: true,
    opacity: 0.3 
});
const gridGlobe = new THREE.Mesh(gridGeometry, gridMaterial);
gridGlobe.visible = false; // <--- СКРЫВАЕМ СЕТКУ
scene.add(gridGlobe);

// 6. Переменные игры
let bases = []; 
let selectedBase = null; 
let currentAngle = 0; 
let isCharging = false; 
let power = 0; 
let powerInterval = null;
const maxPower = 10; 
let currentDirection = new THREE.Vector3(1, 0, 0); 

// UI элементы
const uiPanel = document.getElementById('ui-panel');
const powerBar = document.getElementById('power-bar');
const btnLeft = document.getElementById('turn-left');
const btnRight = document.getElementById('turn-right');
const fireBtn = document.getElementById('fire-btn');

// 7. Создание Главной Базы
const baseGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16); 
const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x00aaff }); 
const mainHub = new THREE.Mesh(baseGeometry, baseMaterial);

function layFlatOnSphere(mesh, position) {
    mesh.position.copy(position);
    const normal = position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, normal);
}

const hubPos = new THREE.Vector3(0, 10, 0);
layFlatOnSphere(mainHub, hubPos);
scene.add(mainHub);
bases.push({ mesh: mainHub, position: hubPos });

// Стрелка направления
const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.6, 0xffff00, 0.15, 0.1);
arrowHelper.visible = false; 
scene.add(arrowHelper);

// 8. Управление камерой (ПРИБЛИЖЕНИЕ СДЕЛАЛИ МАКСИМАЛЬНЫМ)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.zoomSpeed = 1.2;
controls.target.copy(hubPos); 
controls.minDistance = 0.1; // <--- Подлетаем почти вплотную
controls.maxDistance = 30; 

// 9. Рейкастер
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'power-bar-container') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const baseMeshes = bases.map(b => b.mesh);
    const intersects = raycaster.intersectObjects(baseMeshes);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        selectedBase = bases.find(b => b.mesh === clickedMesh);
        
        controls.target.copy(selectedBase.position);
        
        uiPanel.style.display = 'block';
        arrowHelper.position.copy(selectedBase.position);
        currentAngle = 0;
        updateArrowDirection();
        arrowHelper.visible = true;
    } else {
        selectedBase = null;
        uiPanel.style.display = 'none';
        arrowHelper.visible = false;
    }
});

// 10. Поворот стрелки
btnLeft.addEventListener('click', () => {
    if (!selectedBase) return;
    currentAngle += 15; 
    updateArrowDirection();
});

btnRight.addEventListener('click', () => {
    if (!selectedBase) return;
    currentAngle -= 15;
    updateArrowDirection();
});

function updateArrowDirection() {
    if (!selectedBase) return;
    const normal = selectedBase.position.clone().normalize();
    let baseVector = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.y) > 0.9) baseVector.set(0, 0, 1);
    
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(currentAngle));
    
    currentDirection.copy(tangent);
    arrowHelper.setDirection(currentDirection);
}

// 11. Заряд и выстрел
fireBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!selectedBase) return;
    
    isCharging = true;
    power = 0;
    powerBar.style.width = '0%';
    
    powerInterval = setInterval(() => {
        if (power < maxPower) {
            power += 0.2;
            powerBar.style.width = (power / maxPower * 100) + '%';
        }
    }, 50);
});

window.addEventListener('pointerup', () => {
    if (isCharging) {
        isCharging = false;
        clearInterval(powerInterval);
        powerBar.style.width = '0%';
        if (power > 0) shootBase();
    }
});

// 12. Логика полета
function shootBase() {
    const distance = power * 0.15; 
    const targetPos = selectedBase.position.clone().add(currentDirection.clone().multiplyScalar(distance)).normalize().multiplyScalar(10);

    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({color: 0xffaa00}));
    projectile.position.copy(selectedBase.position);
    scene.add(projectile);

    const startPos = selectedBase.position.clone();
    const startTime = performance.now();
    const duration = 1000; 
    
    const travelDistance = startPos.distanceTo(targetPos);
    const maxHeight = Math.min(travelDistance * 0.2, 0.4); 

    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;

        if (t <= 1) {
            const surfacePoint = new THREE.Vector3().copy(startPos).lerp(targetPos, t).normalize().multiplyScalar(10);
            const heightOffset = Math.sin(t * Math.PI) * maxHeight;
            const normal = surfacePoint.clone().normalize();
            projectile.position.copy(surfacePoint).add(normal.multiplyScalar(heightOffset));
            requestAnimationFrame(animateFlight);
        } else {
            scene.remove(projectile);
            createNewBase(targetPos);
        }
    }
    animateFlight();
}

function createNewBase(pos) {
    const newBase = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 })); 
    layFlatOnSphere(newBase, pos); 
    scene.add(newBase);
    bases.push({ mesh: newBase, position: pos.clone() });
}

// 13. Анимация и защита от проваливания
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Если камера подлетела слишком близко к центру планеты, выталкиваем её
    if (camera.position.length() < 10.02) {
        camera.position.setLength(10.02);
    }

    renderer.render(scene, camera);
}

animate();

animate();
