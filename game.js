const config = {
    type: Phaser.AUTO,
    width: 1920,
    height: 1080,
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1200 }, // Гравитация
            debug: false
        }
    },
    scene: {
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

const tileWidth = 128;
const tileHeight = 64;
const gridCols = 16;
const gridRows = 16;

const startX = 960; 
const startY = 150;

function getIsoCoords(col, row) {
    return {
        x: startX + (col - row) * (tileWidth / 2),
        y: startY + (col + row) * (tileHeight / 2)
    };
}

let hub;
let aimGraphics;
let isDragging = false;
let projectiles = []; // Массив для летящих снарядов

function create() {
    // 1. Рисуем сетку
    const gridGraphics = this.add.graphics();
    gridGraphics.lineStyle(3, 0x4a4a6a, 1);
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const pos = getIsoCoords(col, row);
            drawDiamond(gridGraphics, pos.x, pos.y);
        }
    }

    // 2. Ставим Хаб
    const hubPos = getIsoCoords(8, 8);
    hub = this.add.circle(hubPos.x, hubPos.y, 35, 0x00aaff); 
    hub.setDepth(2); // Хаб поверх сетки

    aimGraphics = this.add.graphics();

    // 3. Начало прицеливания
    this.input.on('pointerdown', () => {
        isDragging = true;
    });

    // 4. Отрисовка траектории (движение мыши)
    this.input.on('pointermove', (pointer) => {
        if (!isDragging) return;
        aimGraphics.clear();

        const angle = Phaser.Math.Angle.Between(hub.x, hub.y, pointer.x, pointer.y);
        const distance = Phaser.Math.Distance.Between(hub.x, hub.y, pointer.x, pointer.y);
        const power = Math.min(distance, 500) * 4; 

        const vx = Math.cos(angle + Math.PI) * power;
        const vy = Math.sin(angle + Math.PI) * power;
        const gravity = 1200;

        // Рисуем пунктирную линию (параболу)
        aimGraphics.fillStyle(0xffff00, 1);
        for (let t = 0; t < 2; t += 0.05) {
            let px = hub.x + vx * t;
            let py = hub.y + vy * t + 0.5 * gravity * t * t;
            
            aimGraphics.fillCircle(px, py, 4);

            // Если траектория уходит за нижний край экрана, прекращаем рисовать
            if (py > 1080) break;
        }
    });

    // 5. Выстрел (отпускаем мышь)
    this.input.on('pointerup', (pointer) => {
        if (!isDragging) return;
        isDragging = false;
        aimGraphics.clear();

        const angle = Phaser.Math.Angle.Between(hub.x, hub.y, pointer.x, pointer.y);
        const distance = Phaser.Math.Distance.Between(hub.x, hub.y, pointer.x, pointer.y);
        const power = Math.min(distance, 500) * 4; 

        // Создаем снаряд
        const projectile = this.add.circle(hub.x, hub.y, 20, 0xffaa00);
        this.physics.add.existing(projectile);
        projectile.setDepth(2);

        projectile.body.setVelocity(
            Math.cos(angle + Math.PI) * power,
            Math.sin(angle + Math.PI) * power
        );
        
        // Добавляем снаряд в массив, чтобы update() следил за его падением
        projectiles.push(projectile);
    });
}

// Следим за снарядами в реальном времени
function update() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let proj = projectiles[i];

        // Если снаряд летит вниз (velocity.y > 0)
        if (proj.body.velocity.y > 0) {
            // Переводим его экранные координаты в координаты сетки
            const dx = proj.x - startX;
            const dy = proj.y - startY;

            let col = Math.round((dx / (tileWidth / 2) + dy / (tileHeight / 2)) / 2);
            let row = Math.round((dy / (tileHeight / 2) - dx / (tileWidth / 2)) / 2);

            // Если координаты попадают в пределы нашей сетки
            if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
                const tilePos = getIsoCoords(col, row);
                
                // Создаем здание (фиолетовый ромб) на месте падения
                const building = this.add.polygon(
                    tilePos.x, tilePos.y,
                    [0, -tileHeight/2, tileWidth/2, 0, 0, tileHeight/2, -tileWidth/2, 0],
                    0xaa00aa // Фиолетовый цвет
                );
                building.setDepth(1); // Здание поверх сетки

                // Уничтожаем снаряд
                proj.destroy();
                projectiles.splice(i, 1);
            }
        }

        // Если снаряд улетел за пределы экрана (промах)
        if (proj.y > 1200 || proj.x < 0 || proj.x > 1920) {
            proj.destroy();
            projectiles.splice(i, 1);
        }
    }
}

function drawDiamond(graphics, x, y) {
    graphics.beginPath();
    graphics.moveTo(x, y - tileHeight / 2); 
    graphics.lineTo(x + tileWidth / 2, y);   
    graphics.lineTo(x, y + tileHeight / 2);  
    graphics.lineTo(x - tileWidth / 2, y);   
    graphics.closePath();
    graphics.strokePath();
}
