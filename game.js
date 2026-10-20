// 1. Сцена, камера, рендерер
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 25;

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

// 3. Управление камерой (исправлен зум)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false; 
controls.minDistance = 15; // Не даем камере провалиться сквозь планету
controls.maxDistance = 40;

// 4. Переменные игры
let bases = []; 
let selectedBase = null; 
let currentAngle = 0; 
let isCharging = false; 
let power = 0; 
let powerInterval = null;
const maxPower = 10; 

// UI элементы
const uiPanel = document.getElementById('ui-panel');
const powerBar = document.getElementById('power-bar');
const btnLeft = document.getElementById('turn-left');
const btnRight = document.getElementById('turn-right');
const fireBtn = document.getElementById('fire-btn');

// 5. Размеры и создание Главной Базы
// РАЗМЕР УМЕНЬШЕН В 10 РАЗ (радиус 0.05)
const baseGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12); 
const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x00aaff }); 
const mainHub = new THREE.Mesh(baseGeometry, baseMaterial);

// Правильная функция для "укладки" объекта на сферу
function layFlatOnSphere(mesh, position) {
    mesh.position.copy(position);
    // В Three.js цилиндр по умолчанию стоит вдоль оси Y.
    // Нам нужно повернуть его так, чтобы ось Y совпала с нормалью (направлением от центра)
    const normal = position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, normal);
}

// Ставим главную базу на верхушку
const hubPos = new THREE.Vector3(0, 10, 0);
layFlatOnSphere(mainHub, hubPos);
scene.add(mainHub);
bases.push({ mesh: mainHub, position: hubPos });

// Стрелка направления (сделаем чуть заметнее)
const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1, 0xffff00, 0.2, 0.1);
arrowHelper.visible = false; 
scene.add(arrowHelper);

// 6. Рейкастер (клик по базе)
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
        
        // Настраиваем стрелку
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
    let tangent = baseVector.cross(normal).normalize();
    tangent.applyAxisAngle(normal, THREE.MathUtils.degToRad(currentAngle));
    arrowHelper.setDirection(tangent);
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
        
        if (power > 0) {
            shootBase();
        }
    }
});

// 9. Логика полета (Сделали медленнее и красивее)
function shootBase() {
    const normal = selectedBase.position.clone().normalize();
    const direction = arrowHelper.getWorldDirection(new THREE.Vector3());
    
    // Так как базы стали маленькими, дистанцию тоже уменьшаем
    const distance = power * 0.15; 
    const targetPos = selectedBase.position.clone().add(direction.multiplyScalar(distance)).normalize().multiplyScalar(10);

    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({color: 0xffaa00}));
    projectile.position.copy(selectedBase.position);
    scene.add(projectile);

    const startPos = selectedBase.position.clone();
    const startTime = performance.now();
    const duration = 1000; // Полет длится 1 секунду (1000 мс)
    
    function animateFlight() {
        const elapsed = performance.now() - startTime;
        let t = elapsed / duration;

        if (t <= 1) {
            // Дуга (квадратичная кривая Безье)
            const controlPoint = startPos.clone().add(targetPos).multiplyScalar(0.5).normalize().multiplyScalar(12); // Высота дуги
            
            const p1 = startPos.clone().lerp(controlPoint, t);
            const p2 = controlPoint.clone().lerp(targetPos, t);
            projectile.position.copy(p1.lerp(p2, t));
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
    layFlatOnSphere(newBase, pos); // Используем правильную функцию посадки
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
