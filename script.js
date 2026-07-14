// Exercises list
const exercises = [
  "Bench Press", "Pull Ups", "Push Ups", "Deadlift", "Leg Press",
  "Leg Extension", "Leg Curl", "Chest Fly", "Pull-down", "Bent-over Row",
  "Shoulder Press", "Lateral Raise", "Push-down", "Lying Triceps Extension",
  "Dip", "Biceps Curl", "Hammer Curl"
];

// Firebase setup (in firebase-config.js)
let db, auth, currentUser;

// XP system
function getXPToNextLevel(level) {
  return level * 100; // Level 1 → 100, Level 2 → 200 cumulative needed, etc.
}

function calculateTotalXPForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += i * 100;
  return total;
}

// Daily decay (simplified - run on login)
function applyDailyDecay() {
  const today = new Date().toDateString();
  const lastLogin = localStorage.getItem('lastLogin');
  if (lastLogin !== today) {
    // In real app: reset daily XP in Firestore
    console.log("Daily XP reset");
    localStorage.setItem('lastLogin', today);
  }
}

// Populate exercises
function populateExercises() {
  const select = document.getElementById('exercise-select');
  exercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex;
    opt.textContent = ex;
    select.appendChild(opt);
  });
}

// Confirm workout
document.getElementById('confirm-btn').addEventListener('click', () => {
  const exercise = document.getElementById('exercise-select').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const reps = parseInt(document.getElementById('reps').value);

  if (!exercise || !weight || !reps) {
    alert("Fill weight and reps!");
    return;
  }

  const factor = 0.1; // Tune this later
  const xpGain = Math.floor(weight * reps * factor);

  // Update user stats in Firestore here
  console.log(`Logged ${exercise}: ${weight}kg x ${reps} → +${xpGain} XP`);
  // Then call updateUserXP(xpGain)
});
}, 10000);
