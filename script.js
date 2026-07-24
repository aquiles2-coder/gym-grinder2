let db, auth, currentUser = null;
let workoutListenerAttached = false;
let tabsListenerAttached = false;

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
  setupTabs();

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

// Returns today's date as "YYYY-MM-DD" (used for daily XP reset)
function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Muscle system ───────────────────────────────────────────
const ALL_MUSCLES = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Forearms", "Core", "Quads", "Hamstrings", "Glutes", "Calves"
];

// Percentage of XP that goes to each muscle (must sum to 100)
// Ordered alphabetically
const exerciseMuscles = {
  "Bench Press 2 arms":             { Chest: 55, Triceps: 25, Shoulders: 20 },
  "Bent-over Row 2 arms":           { Back: 70, Biceps: 15, Shoulders: 10, Forearms: 5 },
  "Biceps Curl 1 arm":              { Biceps: 85, Forearms: 15 },
  "Chest Fly 1 arm":                { Chest: 90, Shoulders: 10 },
  "Crunches":                       { Core: 100 },
  "Deadlift 2 arms":                { Back: 35, Hamstrings: 25, Glutes: 25, Quads: 10, Core: 5 },
  "Dip bodyweight":                 { Chest: 40, Triceps: 40, Shoulders: 15, Core: 5 },
  "Hammer Curl 1 arm":              { Biceps: 60, Forearms: 40 },
  "Lateral Raise 1 arm":            { Shoulders: 90, Forearms: 10 },
  "Leg Curl 2 legs":                { Hamstrings: 85, Calves: 15 },
  "Leg Extension 2 legs":           { Quads: 90, Core: 10 },
  "Leg Press 2 legs":               { Quads: 50, Glutes: 30, Hamstrings: 15, Calves: 5 },
  "Lying Leg Raises bodyweight":    { Core: 85, Quads: 15 },
  "Lying Triceps Extension 2 arms": { Triceps: 90, Forearms: 10 },
  "Pull Ups bodyweight":            { Back: 60, Biceps: 25, Forearms: 10, Core: 5 },
  "Pull-down 2 arms":               { Back: 75, Biceps: 20, Forearms: 5 },
  "Push Ups bodyweight":            { Chest: 50, Triceps: 25, Shoulders: 15, Core: 10 },
  "Push-down 2 arms":               { Triceps: 85, Forearms: 15 },
  "Shoulder Press 2 arms":          { Shoulders: 70, Triceps: 20, Chest: 10 },
  "Squat bodyweight":               { Quads: 40, Glutes: 30, Hamstrings: 15, Core: 10, Calves: 5 }
};

function emptyMuscles() {
  const m = {};
  ALL_MUSCLES.forEach(name => m[name] = 0);
  return m;
}

// Classification values (factors) from the table – higher = more XP per kg×reps
// Ordered alphabetically
const exerciseFactors = {
  "Bench Press 2 arms": 0.17,
  "Bent-over Row 2 arms": 0.18,
  "Biceps Curl 1 arm": 0.76,
  "Chest Fly 1 arm": 0.70,
  "Crunches": 0.2,
  "Deadlift 2 arms": 0.10,
  "Dip bodyweight": 0.13,
  "Hammer Curl 1 arm": 0.70,
  "Lateral Raise 1 arm": 1.00,
  "Leg Curl 2 legs": 0.25,
  "Leg Extension 2 legs": 0.16,
  "Leg Press 2 legs": 0.07,
  "Lying Leg Raises bodyweight": 0.12,
  "Lying Triceps Extension 2 arms": 0.38,
  "Pull Ups bodyweight": 0.15,
  "Pull-down 2 arms": 0.19,
  "Push Ups bodyweight": 0.106,
  "Push-down 2 arms": 0.29,
  "Shoulder Press 2 arms": 0.26,
  "Squat bodyweight": 0.076
};

function populateExercises() {
  const select = document.getElementById('exercise-select');
  if (!select) return;

  // Always clear previous options so name changes take effect
  select.innerHTML = '';

  // Sort exercises alphabetically
  const exercises = Object.keys(exerciseFactors).sort();
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

function setupTabs() {
  if (tabsListenerAttached) return;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Update buttons
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      document.querySelectorAll('.tab-content').forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
      });
      const target = document.getElementById(tab);
      if (target) {
        target.style.display = 'block';
        target.classList.add('active');
      }

      // Refresh profile when switching to it
      if (tab === 'profile' && currentUser) {
        loadProfile(currentUser.uid);
      }
      if (tab === 'leaderboards') {
        loadLeaderboards();
      }
    });
  });
  tabsListenerAttached = true;
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
      weeklyXP: 0,
      lastDailyReset: getTodayString(),
      muscles: emptyMuscles()
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

      // Reset dailyXP if the day has changed
      const today = getTodayString();
      const updates = {};
      if (!data.muscles) {
        updates.muscles = emptyMuscles();
      }
      if (data.lastDailyReset !== today) {
        updates.dailyXP = 0;
        updates.lastDailyReset = today;
      }
      if (Object.keys(updates).length > 0) {
        await db.collection('users').doc(uid).update(updates);
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

function muscleLevel(xp) {
  // Simple level: every 100 XP = 1 muscle level
  return Math.floor((xp || 0) / 100) + 1;
}

function muscleProgress(xp) {
  // Progress toward next muscle level (0–100)
  return ((xp || 0) % 100);
}

async function loadProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return;

    const data = doc.data();
    const muscles = data.muscles || emptyMuscles();
    const nextLevelXP = calculateCumulativeXP(data.level || 1) + (data.level || 1) * 100;

    // Header
    const header = document.getElementById('profile-header');
    if (header) {
      header.innerHTML = `
        <strong>${data.nickname}</strong><br>
        Level ${data.level} · ${data.xp || 0} / ${nextLevelXP} XP · Strength ${data.strength || 10}
      `;
    }

    // Muscle grid
    const grid = document.getElementById('muscle-grid');
    if (!grid) return;

    // Sort by XP descending so strongest muscles appear first
    const sorted = ALL_MUSCLES
      .map(name => ({ name, xp: muscles[name] || 0 }))
      .sort((a, b) => b.xp - a.xp);

    let html = '';
    sorted.forEach(({ name, xp }) => {
      const lvl = muscleLevel(xp);
      const prog = muscleProgress(xp);
      html += `
        <div class="muscle-card">
          <div class="muscle-name">${name}</div>
          <div class="muscle-level">Lv ${lvl}</div>
          <div class="muscle-xp">${xp} XP</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${prog}%"></div>
          </div>
          <div class="muscle-next">${prog}/100 to next</div>
        </div>
      `;
    });
    grid.innerHTML = html;
  } catch (e) {
    console.error('loadProfile error:', e);
  }
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

  const factor = exerciseFactors[exercise] ?? 0.1;  // fallback if somehow missing
  const xpGain = Math.floor(weight * reps * factor);

  // Muscle distribution for this exercise
  const muscleMap = exerciseMuscles[exercise] || {};
  const muscleGains = {};
  for (const [muscle, pct] of Object.entries(muscleMap)) {
    muscleGains[muscle] = Math.floor(xpGain * (pct / 100));
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    const data = doc.data();

    let newXP = (data.xp || 0) + xpGain;
    let newLevel = data.level || 1;

    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 100) {
      newLevel++;
    }

    // Merge muscle XP
    const currentMuscles = data.muscles || emptyMuscles();
    const updatedMuscles = { ...currentMuscles };
    for (const [muscle, gain] of Object.entries(muscleGains)) {
      updatedMuscles[muscle] = (updatedMuscles[muscle] || 0) + gain;
    }

    // Reset dailyXP if this is a new day, then add today's gain
    const today = getTodayString();
    let dailyXP = data.dailyXP || 0;
    if (data.lastDailyReset !== today) {
      dailyXP = 0;
    }
    dailyXP += xpGain;

    await userRef.update({
      xp: newXP,
      level: newLevel,
      strength: Math.floor((data.strength || 10) + (xpGain / 30)),
      dailyXP: dailyXP,
      lastDailyReset: today,
      weeklyXP: (data.weeklyXP || 0) + xpGain,
      muscles: updatedMuscles
    });

    // Build nice message showing muscle gains
    let muscleMsg = Object.entries(muscleGains)
      .filter(([, g]) => g > 0)
      .map(([m, g]) => `${m} +${g}`)
      .join(', ');

    const logMsg = document.getElementById('log-message');
    if (logMsg) {
      logMsg.innerHTML = `✅ +${xpGain} XP from ${exercise}!<br><span class="muscle-gains">${muscleMsg}</span>`;
    }
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

    // Only show users who have logged in / worked out today
    const today = getTodayString();
    const dailySnap = await db.collection('users')
      .where('lastDailyReset', '==', today)
      .orderBy('dailyXP', 'desc')
      .limit(10)
      .get();

    let dailyHTML = '<h3>📅 Daily Top 10 (XP earned today)</h3><ol>';
    if (dailySnap.empty) {
      dailyHTML += '<li>No workouts logged today yet</li>';
    } else {
      dailySnap.forEach(doc => {
        const d = doc.data();
        dailyHTML += `<li>${d.nickname} — ${d.dailyXP || 0} XP</li>`;
      });
    }
    dailyHTML += '</ol>';
    const dailyLb = document.getElementById('daily-lb');
    if (dailyLb) dailyLb.innerHTML = dailyHTML;

  } catch (e) {
    console.error('Leaderboard error:', e);
    // If the composite index is missing, Firebase will log a link to create it
  }
}
