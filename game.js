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

// 3. Управление камерой
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false; 
controls.minDistance = 12;
controls.maxDistance = 40;

// 4. Переменные игры
let bases = []; // Массив всех баз
let selectedBase = null; // Выбранная база для стрельбы
let currentAngle = 0; // Угол поворота (направление)
let isCharging = false; // Заряжается ли выстрел
let power = 0; // Текущая сила
let powerInterval = null;
const maxPower = 10; // Максимальная сила (в размерах базы)

// UI элементы
const uiPanel = document.getElementById('ui-panel');
const powerBar = document.getElementById('power-bar');
const btnLeft = document.getElementById('turn-left');
const btnRight = document.getElementById('turn-right');
const fireBtn = document.getElementById('fire-btn');

// 5. Создаем Главную Базу (Хаб)
const baseGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16); // Плоский диск
const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x00aaff }); // Синий
const mainHub = new THREE.Mesh(baseGeometry, baseMaterial);

// Ставим базу на верхушку сферы (координаты 0, 10, 0)
mainHub.position.set(0, 10, 0);
mainHub.lookAt(0, 0, 0); // Поворачиваем к центру
mainHub.rotation.x += Math.PI / 2; // Цилиндры в Three.js лежат на боку, поворачиваем
scene.add(mainHub);
bases.push({ mesh: mainHub, position: new THREE.Vector3(0, 10, 0) });

// Стрелка направления
const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 1, 0xffff00);
arrowHelper.visible = false; // Скрываем, пока не выбрана база
scene.add(arrowHelper);

// 6. Рейкастер (клик по базе)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('pointerdown', (event) => {
    // Если кликнули на UI, игнорируем
    if (event.target.tagName === 'BUTTON' || event.target.id === 'power-bar-container') return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    // Ищем пересечения со всеми базами
    const baseMeshes = bases.map(b => b.mesh);
    const intersects = raycaster.intersectObjects(baseMeshes);

    if (intersects.length > 0) {
        // Выбираем базу
        const clickedMesh = intersects[0].object;
        selectedBase = bases.find(b => b.mesh === clickedMesh);
        
        // Показываем UI
        uiPanel.style.display = 'block';
        
        // Настраиваем стрелку
        arrowHelper.position.copy(selectedBase.position);
        // Направляем стрелку по касательной к сфере
        const normal = selectedBase.position.clone().normalize();
        const tangent = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
        arrowHelper.setDirection(tangent);
        arrowHelper.visible = true;
        currentAngle = 0;
    } else {
        // Кликнули мимо - скрываем UI
        selectedBase = null;
        uiPanel.style.display = 'none';
        arrowHelper.visible = false;
    }
});

// 7. Поворот стрелки
btnLeft.addEventListener('click', () => {
    if (!selectedBase) return;
    currentAngle += 15; // Шаг поворота
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
    // Базовый вектор (вправо)
    let baseVector = new THREE.Vector3(1, 0, 0);
    // Если база на полюсе, нужно взять другой вектор
    if (Math.abs(normal.y) > 0.9) baseVector.set(1, 0, 0);
    
    // Вектор касательной
    let tangent = baseVector.cross(normal).normalize();
    
    // Вращаем касательную вокруг нормали на нужный угол
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
    
    // Увеличиваем силу каждые 50 мс
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

// 9. Логика полета и прикрепления
function shootBase() {
    const normal = selectedBase.position.clone().normalize();
    const direction = arrowHelper.getWorldDirection(new THREE.Vector3());
    
    // Вычисляем точку приземления (смещаемся по касательной)
    // 0.4 - это размер базы. Умножаем на силу.
    const distance = power * 0.4; 
    const targetPos = selectedBase.position.clone().add(direction.multiplyScalar(distance)).normalize().multiplyScalar(10);

    // Анимация полета (упрощенная - просто перемещаем снаряд по дуге)
    const projectile = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({color: 0xffaa00}));
    projectile.position.copy(selectedBase.position);
    scene.add(projectile);

    let t = 0;
    const startPos = selectedBase.position.clone();
    
    // Анимация
    const flightInterval = setInterval(() => {
        t += 0.05;
        if (t <= 1) {
            // Квадратичная кривая Безье (дуга)
            // Контрольная точка выносится наружу от сферы
            const controlPoint = startPos.clone().add(targetPos).multiplyScalar(0.5).normalize().multiplyScalar(14);
            
            // Формула Безье
            const p1 = startPos.clone().lerp(controlPoint, t);
            const p2 = controlPoint.clone().lerp(targetPos, t);
            projectile.position.copy(p1.lerp(p2, t));
        } else {
            clearInterval(flightInterval);
            scene.remove(projectile);
            createNewBase(targetPos, direction);
        }
    }, 20);
}

function createNewBase(pos, direction) {
    const newBase = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 })); // Красный
    newBase.position.copy(pos);
    newBase.lookAt(0, 0, 0);
    newBase.rotation.x += Math.PI / 2;
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
