let db, auth, currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  auth = firebase.auth();
  db = firebase.firestore();

  populateExercises();
  setupAuthListeners();
  setupLogout();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('logout-btn').style.display = 'inline-block';

      const doc = await db.collection('users').doc(user.uid).get();
      const data = doc.exists ? doc.data() : {};

      // Only block if approved is explicitly false
      if (data.approved === false) {
        // Not approved yet → show waiting message
        document.getElementById('main-game').style.display = 'none';
        document.getElementById('pending-section').style.display = 'block';
        document.getElementById('user-info').innerHTML = `Welcome, ${data.nickname || 'User'}`;
      } else {
        // Approved (or old account without the field) → show the game
        document.getElementById('pending-section').style.display = 'none';
        document.getElementById('main-game').style.display = 'block';
        await loadUserData(user.uid);
        setupWorkoutListeners();
        loadLeaderboards();
      } else {
        // Not approved yet → show waiting message
        document.getElementById('main-game').style.display = 'none';
        document.getElementById('pending-section').style.display = 'block';
        document.getElementById('user-info').innerHTML = `Welcome, ${doc.exists ? doc.data().nickname : 'User'}`;
      }
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
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('register-btn').addEventListener('click', handleRegister);
}

function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await auth.signOut();
      alert("Logged out successfully!");
    } catch (error) {
      alert("Error logging out: " + error.message);
    }
  });
}

async function handleLogin() {
  const nickname = prompt("Enter Nickname:");
  if (!nickname) return;

  const password = prompt("Enter Password:");
  if (!password) return;

  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    alert("✅ Login successful!");
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      alert("Account not found. Please Register first.");
    } else if (error.code === 'auth/wrong-password') {
      alert("Wrong password.");
    } else {
      alert("Login error: " + error.message);
    }
  }
}

async function handleRegister() {
  const nickname = prompt("Choose a Nickname:");
  if (!nickname) return;

  const password = prompt("Choose a Password (min 4 chars):");
  if (!password || password.length < 4) {
    return alert("Password must be at least 4 characters!");
  }

  const confirmPassword = prompt("Confirm Password:");
  if (password !== confirmPassword) {
    return alert("Passwords do not match!");
  }

  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(userCred.user.uid).set({
      nickname: nickname,
      level: 1,
      xp: 0,
      strength: 10,
      approved: false,   // Admin must approve in Firebase
      dailyXP: 0,
      weeklyXP: 0
    });
    alert("✅ Account created! Waiting for admin approval.");
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      alert("This nickname is already taken. Please choose another one.");
    } else {
      alert("Registration error: " + error.message);
    }
  }
}

async function loadUserData(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.exists) {
    const data = doc.data();
    const nextLevelXP = calculateCumulativeXP(data.level || 1) + (data.level || 1) * 100;
    document.getElementById('stats').innerHTML = `Level: ${data.level} | XP: ${data.xp || 0}/${nextLevelXP} | Strength: ${data.strength || 10}`;
    document.getElementById('user-info').innerHTML = `Welcome, ${data.nickname}`;
  }
}

function calculateCumulativeXP(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += i * 100;
  return total;
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

    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 100) {
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
