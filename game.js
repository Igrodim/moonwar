const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    // Включаем физику (гравитацию)
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 }, // Сила притяжения луны
            debug: false
        }
    },
    scene: {
        create: create
    }
};

const game = new Phaser.Game(config);

const tileWidth = 64;
const tileHeight = 32;
const gridCols = 10;
const gridRows = 10;
const startX = 400;
const startY = 100;

function create() {
    // 1. Рисуем сетку на фоне
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0x4a4a6a, 1);
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const x = startX + (col - row) * (tileWidth / 2);
            const y = startY + (col + row) * (tileHeight / 2);
            drawDiamond(graphics, x, y);
        }
    }

    // 2. Создаем наш Хаб (базу) внизу экрана
    this.hub = this.add.circle(400, 500, 20, 0x00aaff); // Синий круг
    this.physics.add.existing(this.hub, true); // Делаем его статичным (он не падает)

    // 3. Переменные для прицеливания
    this.isDragging = false;
    this.aimLine = this.add.line(0, 0, 400, 500, 400, 500, 0xffff00); // Желтая линия прицела
    this.aimLine.setOrigin(0, 0);

    // 4. Обработка нажатия мыши (начало прицеливания)
    this.input.on('pointerdown', (pointer) => {
        this.isDragging = true;
        this.aimLine.setTo(400, 500, pointer.x, pointer.y);
    });

    // 5. Обработка движения мыши (натяжение)
    this.input.on('pointermove', (pointer) => {
        if (this.isDragging) {
            this.aimLine.setTo(400, 500, pointer.x, pointer.y);
        }
    });

    // 6. Обработка отпускания мыши (выстрел)
    this.input.on('pointerup', (pointer) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.aimLine.setTo(400, 500, 400, 500); // Прячем линию

        // Вычисляем силу и направление (от хаба к мышке)
        // Если натягивать "от" хаба, снаряд полетит в противоположную сторону (как рогатка)
        const angle = Phaser.Math.Angle.Between(400, 500, pointer.x, pointer.y);
        const distance = Phaser.Math.Distance.Between(400, 500, pointer.x, pointer.y);
        
        // Ограничиваем максимальную силу
        const power = Math.min(distance, 300) * 3; 

        // Создаем снаряд (желтый шарик)
        const projectile = this.add.circle(400, 500, 10, 0xffff00);
        this.physics.add.existing(projectile);

        // Даем снаряду скорость
        // Используем угол + Math.PI, чтобы стрелять в противоположную сторону от курсора
        projectile.body.setVelocity(
            Math.cos(angle + Math.PI) * power,
            Math.sin(angle + Math.PI) * power
        );
        
        // Уничтожаем снаряд через 3 секунды, чтобы не засорять память
        this.time.delayedCall(3000, () => { projectile.destroy(); });
    });
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
