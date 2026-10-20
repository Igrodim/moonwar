const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    scene: {
        create: create
    }
};

const game = new Phaser.Game(config);

function create() {
    this.add.text(400, 300, 'MoonWar', {
        fontSize: '64px',
        color: '#e0e0e0',
        fontFamily: 'Arial',
        fontStyle: 'bold'
    }).setOrigin(0.5);
}
