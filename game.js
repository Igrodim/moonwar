// Импортируем размеры сферы, чтобы удобно считать
const PLANET_RADIUS = 10;

// Глобальные переменные игры (доступны внутри этого файла)
let scene, camera, controls;
let bases = []; 
let selectedBase = null; 
let currentAngle = 0; 
let isCharging = false; 
let power = 0; 
let powerInterval = null;
const maxPower = 10; 
let currentDirection = new THREE.Vector3(1, 0, 0); 

const baseGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16); 
let arrowHelper;

// Функция инициализации игры (вызывается из main.js)
export function initGame(_scene, _camera, _controls) {
    scene = _scene;
    camera = _camera;
    controls = _controls;

    setupUI();
    createMainBase();
    setupRaycaster();
}

function setupUI() {
    const uiPanel = document.getElementById('ui-panel');
    const powerBar = document.getElementById('power-bar');
    const btnLeft = document.getElementById('turn-left');
    const btnRight = document.getElementById('turn-right');
    const fireBtn = document.getElementById('fire-btn');

    // Стрелка
    arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.6, 0xffff00, 0.15, 0.1);
    arrowHelper.visible = false; 
    scene.add(arrowHelper);

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
}

function createMainBase() {
    const mainHub = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial({ color: 0x00aaff })); 
    const hubPos = new THREE.Vector3(0, PLANET_RADIUS, 0);
    layFlatOnSphere(mainHub, hubPos);
    scene.add(mainHub);
    bases.push({ mesh: mainHub, position: hubPos });
}

function layFlatOnSphere(mesh, position) {
    mesh.position.copy(position);
    const normal = position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, normal);
}

function setupRaycaster() {
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
            
            document.getElementById('ui-panel').style.display = 'block';
            arrowHelper.position.copy(selectedBase.position);
            currentAngle = 0;
            updateArrowDirection();
            arrowHelper.visible = true;
        } else {
            selectedBase = null;
            document.getElementById('ui-panel').style.display = 'none';
            arrowHelper.visible = false;
        }
    });
}

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

function shootBase() {
    const distance = power * 0.15; 
    const targetPos = selectedBase.position.clone().add(currentDirection.clone().multiplyScalar(distance)).normalize().multiplyScalar(PLANET_RADIUS);

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
            const surfacePoint = new THREE.Vector3().copy(startPos).lerp(targetPos, t).normalize().multiplyScalar(PLANET_RADIUS);
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

animate();
