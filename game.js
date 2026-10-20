// 1. Сцена, камера, рендерер
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e, 1);
document.body.appendChild(renderer.domElement);

// 2. Планета
const globeGeometry = new THREE.SphereGeometry(10, 32, 32); 
const globeMaterial = new THREE.MeshBasicMaterial({ color: 0x4a4a6a, wireframe: true });
const globe = new THREE.Mesh(globeGeometry, globeMaterial);
scene.add(globe);

// 3. Управление камерой
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = true; 
controls.screenSpacePanning = true; 
controls.minDistance = 10.5; 
controls.maxDistance = 40;

// 4. Переменные игры
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

// 5. Размеры и создание Главной Базы
const baseGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12); 
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

// 6. Рейкастер
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

// 7. Поворот стрелки
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

// 8. Заряд и выстрел
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

// 9. НОВАЯ ЛОГИКА ПОЛЕТА (Плоская парабола)
function shootBase() {
    const distance = power * 0.15; 
    // Вычисляем точку приземления
    const targetPos = selectedBase.position.clone().add(currentDirection.clone().multiplyScalar(distance)).normalize().multiplyScalar(10);

    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({color: 0xffaa00}));
    projectile.position.copy(selectedBase.position);
    scene.add(projectile);

    const startPos = selectedBase.position.clone();
    const startTime = performance.now();
    const duration = 1000; // 1 секунда полета
    
    // Вычисляем длину пути, чтобы задать высоту дуги
    const travelDistance = startPos.distanceTo(targetPos);
    // Высота дуги: максимум 0.4 единицы (для дальних выстрелов), для ближних еще меньше
    const maxHeight = Math.min(travelDistance * 0.2, 0.4); 

    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;

        if (t <= 1) {
            // 1. Движемся по поверхности сферы (интерполяция)
            const surfacePoint = new THREE.Vector3().copy(startPos).lerp(targetPos, t).normalize().multiplyScalar(10);
            
            // 2. Добавляем высоту по синусоиде (плавный взлет и падение)
            const heightOffset = Math.sin(t * Math.PI) * maxHeight;
            
            // 3. Итоговая позиция
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

// 10. Анимация
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
