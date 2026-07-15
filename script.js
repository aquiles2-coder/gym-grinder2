let db, auth, currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  auth = firebase.auth();
  db = firebase.firestore();

  populateExercises();
  setupAuthListeners();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('main-game').style.display = 'block';
      await loadUserData(user.uid);
      setupWorkoutListeners();
      loadLeaderboards();
      setupLogout();
    } else {
      document.getElementById('auth-section').style.display = 'block';
      document.getElementById('main-game').style.display = 'none';
    }
  });
});

function populateExercises() {
  const select = document.getElementById('exercise-select');
  const exercises = ["Bench Press","Pull Ups","Push Ups","Deadlift","Leg Press","Leg Extension","Leg Curl","Chest Fly","Pull-down","Bent-over Row","Shoulder Press","Lateral Raise","Push-down","Lying Triceps Extension","Dip","Biceps Curl","Hammer Curl"];
  exercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex;
    opt.textContent = ex;
    select.appendChild(opt);
  });
}

function setupAuthListeners() {
  document.getElementById('show-auth-btn').addEventListener('click', handleAuth);
}

async function handleAuth() {
  const nickname = prompt("Enter Nickname:");
  if (!nickname) return;

  const password = prompt("Enter Password (min 4 chars):");
  if (password.length < 4) return alert("Password too short!");

  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    let userCred;
    try {
      userCred = await auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        userCred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({
          nickname: nickname,
          level: 1,
          xp: 0,
          strength: 10,
          approved: true,           // ← Set to true for easier testing
          dailyXP: 0,
          weeklyXP: 0
        });
        alert("Account created!");
      } else {
        throw e;
      }
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

async function loadUserData(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.exists) {
    const data = doc.data();
    document.getElementById('stats').innerHTML = `Level: ${data.level} | XP: ${data.xp}/${data.level * 100} | Strength: ${data.strength}`;
    document.getElementById('user-info').innerHTML = `Welcome, ${data.nickname}`;
  }
}

function setupWorkoutListeners() {
  document.getElementById('confirm-btn').addEventListener('click', logWorkout);
}

async function logWorkout() {
  const exercise = document.getElementById('exercise-select').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const reps = parseInt(document.getElementById('reps').value);

  if (isNaN(weight) || isNaN(reps) || reps < 1) {
    alert("Please enter valid weight and reps!");
    return;
  }

  const factor = 0.1;
  const xpGain = Math.floor(weight * reps * factor);

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    const data = doc.data();

    let currentXP = data.xp || 0;
    let currentLevel = data.level || 1;

    let newXP = currentXP + xpGain;
    let newLevel = currentLevel;

    // Calculate required XP for next level
    while (true) {
      const xpNeededForNextLevel = newLevel * 100;
      if (newXP < (calculateCumulativeXP(newLevel) + xpNeededForNextLevel)) {
        break;
      }
      newLevel++;
    }

    await userRef.update({
      xp: newXP,
      level: newLevel,
      strength: Math.floor((data.strength || 10) + (xpGain / 30)),
      dailyXP: (data.dailyXP || 0) + xpGain,
      weeklyXP: (data.weeklyXP || 0) + xpGain
    });

    document.getElementById('log-message').innerHTML = `✅ +${xpGain} XP from ${exercise}!`;
    await loadUserData(currentUser.uid);
    loadLeaderboards();

  } catch (error) {
    console.error("Workout error:", error);
    alert("Error saving workout.");
  }
}

// Helper function for cumulative XP
function calculateCumulativeXP(level) {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += i * 100;
  }
  return total;
}

// Also update loadUserData to show correct next level XP
async function loadUserData(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.exists) {
    const data = doc.data();
    const nextLevelXP = calculateCumulativeXP(data.level) + (data.level * 100);
    document.getElementById('stats').innerHTML = `Level: ${data.level} | XP: ${data.xp}/${nextLevelXP} | Strength: ${data.strength}`;
    document.getElementById('user-info').innerHTML = `Welcome, ${data.nickname}`;
  }
}

// Leaderboards
async function loadLeaderboards() {
  try {
    const globalSnap = await db.collection('users').orderBy('level', 'desc').limit(20).get();
    let html = "<h3>🌍 Global Top 20</h3><ol>";
    globalSnap.forEach(doc => {
      const d = doc.data();
      html += `<li>${d.nickname} — Level ${d.level} (${d.xp} XP)</li>`;
    });
    html += "</ol>";
    document.getElementById('global-lb').innerHTML = html;

    const dailySnap = await db.collection('users').orderBy('dailyXP', 'desc').limit(10).get();
    let dailyHTML = "<h3>📅 Daily Top 10</h3><ol>";
    dailySnap.forEach(doc => {
      const d = doc.data();
      dailyHTML += `<li>${d.nickname} — ${d.dailyXP} XP</li>`;
    });
    dailyHTML += "</ol>";
    if (document.getElementById('daily-lb')) document.getElementById('daily-lb').innerHTML = dailyHTML;

  } catch (e) {
    console.error("Leaderboard error:", e);
  }

  // Logout functionality
function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm("Are you sure you want to logout?")) {
        await auth.signOut();
        alert("Logged out successfully.");
      }
    });
  }
}

// Call it after auth state change
// Add this line inside onAuthStateChanged, after setupWorkoutListeners():
setupLogout();
}
