// 1. Настройка сцены и камеры
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 20; // Отодвинули камеру чуть дальше, чтобы шар влез в экран

// 2. Настройка рендерера (холста)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1a2e, 1); // Устанавливаем темно-синий фон
document.body.appendChild(renderer.domElement);

// 3. Создаем планету (сферу)
const sphereGeometry = new THREE.SphereGeometry(10, 32, 32); 
const sphereMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x4a4a6a, 
    wireframe: true 
});
const globe = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(globe);

// 4. Добавляем управление (вращение мышкой)
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.rotateSpeed = 0.5;

// 5. Обработка ресайза
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 6. Рейкастер (определяем клик по планете)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(globe);

    if (intersects.length > 0) {
        const point = intersects[0].point;
        console.log("Клик по планете!", point);

        // Создаем здание (красный кубик) на месте клика
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const cube = new THREE.Mesh(geometry, material);
        
        // Привязываем кубик к поверхности
        cube.position.copy(point);
        cube.position.normalize().multiplyScalar(10.2); // Выдвигаем чуть наружу
        
        // Поворачиваем кубик так, чтобы он "смотрел" от центра планеты
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
