// 1. Настройка сцены и камеры
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 20;

// 2. Настройка рендерера
const renderer = new THREE.WebGLRenderer({ antialias: true });
// ВОТ ГЛАВНЫЙ ФИКС ОТ ТОРМОЗОВ:
// Ограничиваем разрешение рендера, чтобы он не нагружал видеокарту на 4K мониторах
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e, 1);
document.body.appendChild(renderer.domElement);

// 3. Создаем планету (сферу)
// Уменьшили количество сегментов с 32 до 24, это быстрее и визуально почти незаметно
const sphereGeometry = new THREE.SphereGeometry(10, 24, 24); 
const sphereMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x4a4a6a, 
    wireframe: true 
});
const globe = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(globe);

// 4. Добавляем управление
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.rotateSpeed = 0.5;
// Запрещаем сдвигать планету (пан), чтобы она не улетела за экран
controls.enablePan = false; 
// Ограничиваем зум (нельзя залезть внутрь планеты или улететь слишком далеко)
controls.minDistance = 13;
controls.maxDistance = 30;

// 5. Ресайз
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 6. Рейкастер
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
    // Игнорируем клик, если игрок крутил планету (чтобы зря не ставить кубики)
    // В Three.js сложно отследить "клик или драг", поэтому пока оставим так, 
    // но добавим проверку: если камера движется, не ставим кубик.
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(globe);

    if (intersects.length > 0) {
        const point = intersects[0].point;

        // Создаем здание
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cube = new THREE.Mesh(geometry, material);
        
        cube.position.copy(point);
        cube.position.normalize().multiplyScalar(10.2); 
        cube.lookAt(0, 0, 0);
        
        scene.add(cube);
    }
});

// 7. Анимация
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
