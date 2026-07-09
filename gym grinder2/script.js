let player = {
  level: 1,
  xp: 0,
  xpToNext: 100,
  strength: 10,
  coins: 50,
  energy: 100,
  maxEnergy: 100
};

const grindBtn = document.getElementById('grind-btn');
const statsEl = document.getElementById('stats');
const repsEl = document.getElementById('reps');

let currentReps = 0;

grindBtn.addEventListener('click', () => {
  if (player.energy <= 0) return alert("No energy left! Rest and come back.");
  
  currentReps += Math.floor(Math.random() * 3) + 1;
  player.xp += 5 + Math.floor(player.strength / 5);
  player.energy -= 2;
  player.strength += 0.1; // tiny permanent gain
  
  repsEl.textContent = `Reps: ${currentReps}`;
  updateStats();
  
  if (player.xp >= player.xpToNext) levelUp();
});

function updateStats() {
  statsEl.textContent = `Level: ${player.level} | XP: \( {Math.floor(player.xp)}/ \){player.xpToNext} | Strength: ${player.strength.toFixed(1)} | Coins: ${player.coins} | Energy: \( {player.energy}/ \){player.maxEnergy}`;
}

function levelUp() {
  player.level++;
  player.xp = 0;
  player.xpToNext = Math.floor(player.xpToNext * 1.5);
  player.strength += 5;
  alert(`Level Up! Now level ${player.level} 💪`);
  updateStats();
}

// Load/Save
function saveGame() { localStorage.setItem('gymGrinderSave', JSON.stringify(player)); }
function loadGame() {
  const saved = localStorage.getItem('gymGrinderSave');
  if (saved) player = JSON.parse(saved);
}
loadGame();
setInterval(() => { saveGame(); updateStats(); }, 5000);

// Idle energy regen (every 10 seconds)
setInterval(() => {
  if (player.energy < player.maxEnergy) player.energy = Math.min(player.maxEnergy, player.energy + 5);
  updateStats();
}, 10000);