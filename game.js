// 1. Настройка сцены и камеры
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 15; // Отодвигаем камеру назад, чтобы видеть планету

// 2. Настройка рендерера (холста)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 3. Создаем планету (сферу)
// 10 - радиус, 32 и 32 - количество сегментов сетки
const sphereGeometry = new THREE.SphereGeometry(10, 32, 32); 
// Делаем ее прозрачной с сеткой (wireframe)
const sphereMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x4a4a6a, 
    wireframe: true 
});
const globe = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(globe);

// 4. Добавляем управление (вращение мышкой)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Плавная остановка
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.rotateSpeed = 0.5;

// 5. Обработка ресайза (если менять размер окна браузера)
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 6. Добавляем Рейкастер (чтобы понимать, куда кликнул игрок)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
    // Переводим координаты мыши в нормализованные (-1 до 1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Стреляем лучом из камеры в точку клика
    raycaster.setFromCamera(mouse, camera);

    // Проверяем пересечение с нашим глобусом
    const intersects = raycaster.intersectObject(globe);

    if (intersects.length > 0) {
        // Если луч попал в шар, получаем точку на поверхности
        const point = intersects[0].point;
        console.log("Попадание в планету! Координаты:", point.x, point.y, point.z);

        // Для теста: ставим красный кубик на место клика
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cube = new THREE.Mesh(geometry, material);
        
        // Ставим кубик ровно в точку клика
        cube.position.copy(point);
        // Слегка выдвигаем его наружу, чтобы не сливался с сеткой
        cube.position.normalize().multiplyScalar(10.1);
        
        scene.add(cube);
    }
});

// 7. Анимация (постоянный цикл)
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Обновляем позицию камеры для плавности
    renderer.render(scene, camera);
}

animate();
