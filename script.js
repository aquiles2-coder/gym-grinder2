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

    let newXP = (data.xp || 0) + xpGain;
    let newLevel = data.level || 1;

    while (newXP >= newLevel * 100) {
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
    loadLeaderboards();        // Refresh leaderboards

  } catch (error) {
    console.error("Workout error:", error);
    alert("Error saving workout. Check console (F12)");
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
}
