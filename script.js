let db, auth, currentUser = null;
let workoutListenerAttached = false;

document.addEventListener('DOMContentLoaded', () => {
  // Safety check: Firebase must be loaded
  if (typeof firebase === 'undefined') {
    alert('Firebase failed to load. Check your internet connection and firebase-config.js');
    console.error('Firebase is not defined');
    return;
  }

  try {
    auth = firebase.auth();
    db = firebase.firestore();
  } catch (e) {
    alert('Error initializing Firebase: ' + e.message);
    console.error(e);
    return;
  }

  populateExercises();
  setupAuthListeners();
  setupLogout();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      hide('auth-section');
      hide('pending-section');
      show('logout-btn', 'inline-block');
      show('main-game', 'block');

      try {
        await loadUserData(user.uid);
        setupWorkoutListeners();
        loadLeaderboards();
      } catch (err) {
        console.error('Error loading user data:', err);
        setupWorkoutListeners();
      }
    } else {
      currentUser = null;
      show('auth-section', 'block');
      hide('main-game');
      hide('pending-section');
      hide('logout-btn');
    }
  });
});

function show(id, display = 'block') {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function populateExercises() {
  const select = document.getElementById('exercise-select');
  if (!select) return;

  // Avoid duplicating options on re-runs
  if (select.options.length > 0) return;

  const exercises = [
    "Bench Press", "Pull Ups", "Push Ups", "Deadlift", "Leg Press",
    "Leg Extension", "Leg Curl", "Chest Fly", "Pull-down", "Bent-over Row",
    "Shoulder Press", "Lateral Raise", "Push-down", "Lying Triceps Extension",
    "Dip", "Biceps Curl", "Hammer Curl"
  ];
  exercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex;
    opt.textContent = ex;
    select.appendChild(opt);
  });
}

function setupAuthListeners() {
  const loginBtn = document.getElementById('login-btn');
  const registerBtn = document.getElementById('register-btn');

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  } else {
    console.error('login-btn not found in HTML');
  }

  if (registerBtn) {
    registerBtn.addEventListener('click', handleRegister);
  } else {
    console.error('register-btn not found in HTML');
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await auth.signOut();
        alert('Logged out successfully!');
      } catch (error) {
        alert('Error logging out: ' + error.message);
      }
    });
  } else {
    console.error('logout-btn not found in HTML');
  }
}

async function handleLogin() {
  const nickname = prompt('Enter Nickname:');
  if (!nickname) return;

  const password = prompt('Enter Password:');
  if (!password) return;

  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    alert('✅ Login successful!');
  } catch (error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      alert('Account not found or wrong password. Please Register first or check your details.');
    } else if (error.code === 'auth/wrong-password') {
      alert('Wrong password.');
    } else {
      alert('Login error: ' + error.message);
    }
  }
}

async function handleRegister() {
  const nickname = prompt('Choose a Nickname:');
  if (!nickname) return;

  const password = prompt('Choose a Password (min 4 chars):');
  if (!password || password.length < 4) {
    return alert('Password must be at least 4 characters!');
  }

  const confirmPassword = prompt('Confirm Password:');
  if (password !== confirmPassword) {
    return alert('Passwords do not match!');
  }

  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(userCred.user.uid).set({
      nickname: nickname,
      level: 1,
      xp: 0,
      strength: 10,
      approved: true,
      dailyXP: 0,
      weeklyXP: 0
    });
    alert('✅ Account created successfully! You are now logged in.');
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      alert('This nickname is already taken. Please choose another one.');
    } else {
      alert('Registration error: ' + error.message);
    }
  }
}

async function loadUserData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const nextLevelXP = calculateCumulativeXP(data.level || 1) + (data.level || 1) * 100;
      const statsEl = document.getElementById('stats');
      const userInfoEl = document.getElementById('user-info');
      if (statsEl) {
        statsEl.innerHTML = `Level: ${data.level} | XP: ${data.xp || 0}/${nextLevelXP} | Strength: ${data.strength || 10}`;
      }
      if (userInfoEl) {
        userInfoEl.innerHTML = `Welcome, ${data.nickname}`;
      }
    }
  } catch (e) {
    console.error('loadUserData error:', e);
  }
}

function calculateCumulativeXP(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += i * 100;
  return total;
}

function setupWorkoutListeners() {
  if (workoutListenerAttached) return;
  const btn = document.getElementById('confirm-btn');
  if (btn) {
    btn.addEventListener('click', logWorkout);
    workoutListenerAttached = true;
  }
}

async function logWorkout() {
  const exercise = document.getElementById('exercise-select').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const reps = parseInt(document.getElementById('reps').value);

  if (isNaN(weight) || isNaN(reps) || reps < 1) {
    alert('Please enter valid weight and reps!');
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

    const logMsg = document.getElementById('log-message');
    if (logMsg) logMsg.innerHTML = `✅ +${xpGain} XP from ${exercise}!`;
    await loadUserData(currentUser.uid);
    loadLeaderboards();

  } catch (error) {
    console.error('Workout error:', error);
    alert('Error saving workout.');
  }
}

async function loadLeaderboards() {
  try {
    const globalSnap = await db.collection('users').orderBy('level', 'desc').limit(20).get();
    let html = '<h3>🌍 Global Top 20</h3><ol>';
    globalSnap.forEach(doc => {
      const d = doc.data();
      html += `<li>${d.nickname} — Level ${d.level} (${d.xp} XP)</li>`;
    });
    html += '</ol>';
    const globalLb = document.getElementById('global-lb');
    if (globalLb) globalLb.innerHTML = html;

    const dailySnap = await db.collection('users').orderBy('dailyXP', 'desc').limit(10).get();
    let dailyHTML = '<h3>📅 Daily Top 10</h3><ol>';
    dailySnap.forEach(doc => {
      const d = doc.data();
      dailyHTML += `<li>${d.nickname} — ${d.dailyXP} XP</li>`;
    });
    dailyHTML += '</ol>';
    const dailyLb = document.getElementById('daily-lb');
    if (dailyLb) dailyLb.innerHTML = dailyHTML;

  } catch (e) {
    console.error('Leaderboard error:', e);
  }
}
