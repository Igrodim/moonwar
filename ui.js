export const uiElements = {
    turnText: document.getElementById('turn-text'),
    energyText: document.getElementById('energy-text'),
    topInfo: document.getElementById('top-info'),
    waitingScreen: document.getElementById('waiting-screen'),
    bottomPanel: document.getElementById('bottom-panel'),
    uiPanel: document.getElementById('ui-panel'),
    spinBtn: document.getElementById('spin-btn'),
    endTurnBtn: document.getElementById('end-turn-btn'),
    fireBtn: document.getElementById('fire-btn'),
    btnLeft: document.getElementById('turn-left'),
    btnRight: document.getElementById('turn-right'),
    powerBar: document.getElementById('power-bar'),
    moduleBtns: document.querySelectorAll('.module-btn'),
    startScreen: document.getElementById('start-screen'),
    startBtn: document.getElementById('start-btn'),
    aiCountInput: document.getElementById('ai-count'),
    aiSpeedSelect: document.getElementById('ai-speed'),
    rotateLeft: document.getElementById('rotate-left'),
    rotateRight: document.getElementById('rotate-right')
};

export function updateUI(currentPlayer, energy, playerColors) {
    uiElements.turnText.innerText = `Ход: Игрок ${currentPlayer}`;
    uiElements.energyText.innerText = `Энергия: ${energy}`;
    uiElements.turnText.style.color = '#' + playerColors[currentPlayer - 1].toString(16).padStart(6, '0');
}

export function clearSelection() {
    uiElements.moduleBtns.forEach(b => b.classList.remove('selected'));
    uiElements.uiPanel.style.display = 'none';
}
