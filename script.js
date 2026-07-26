let db, auth, currentUser = null;
let workoutListenerAttached = false;
let tabsListenerAttached = false;
let lastLoggedSet = null; // stores the most recent set so we can undo it

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

// Returns today's date as "YYYY-MM-DD" in Lisbon time (used for daily XP reset)
function getTodayString() {
  // en-CA locale gives YYYY-MM-DD format
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' });
}

// Returns the Monday of the current week as "YYYY-MM-DD" in Lisbon time
function getWeekStartString() {
  // Get current date parts in Lisbon timezone
  const lisbonStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' });
  const lisbonDate = new Date(lisbonStr);

  const day = lisbonDate.getDay(); // 0 = Sunday ... 6 = Saturday
  const diff = lisbonDate.getDate() - day + (day === 0 ? -6 : 1); // shift to Monday

  const monday = new Date(lisbonDate);
  monday.setDate(diff);

  // Format as YYYY-MM-DD
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const date = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
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

// Classification values (factors) from the table – used in XP formula: reps * (weight * factor)^2
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

      // Refresh data when switching to the corresponding tab
      if (tab === 'profile' && currentUser) {
        loadProfile(currentUser.uid);
      }
      if (tab === 'weekly' && currentUser) {
        loadWeeklyProgress(currentUser.uid);
      }
      if (tab === 'history' && currentUser) {
        loadHistory(currentUser.uid);
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
      lastWeeklyReset: getWeekStartString(),
      muscles: emptyMuscles(),
      weeklyMuscles: emptyMuscles()
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

      // Reset dailyXP / weeklyXP / weeklyMuscles if the period has changed
      const today = getTodayString();
      const weekStart = getWeekStartString();
      const updates = {};
      if (!data.muscles) {
        updates.muscles = emptyMuscles();
      }
      if (!data.weeklyMuscles) {
        updates.weeklyMuscles = emptyMuscles();
      }
      if (data.lastDailyReset !== today) {
        updates.dailyXP = 0;
        updates.lastDailyReset = today;
      }
      if (data.lastWeeklyReset !== weekStart) {
        updates.weeklyXP = 0;
        updates.weeklyMuscles = emptyMuscles();
        updates.lastWeeklyReset = weekStart;
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
  // Simple level: every 500 XP = 1 muscle level
  return Math.floor((xp || 0) / 500) + 1;
}

function muscleProgress(xp) {
  // XP toward next muscle level (0–499)
  return ((xp || 0) % 500);
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
      const progPct = Math.floor((prog / 500) * 100);
      html += `
        <div class="muscle-card">
          <div class="muscle-name">${name}</div>
          <div class="muscle-level">Lv ${lvl}</div>
          <div class="muscle-xp">${xp} XP</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progPct}%"></div>
          </div>
          <div class="muscle-next">${prog}/500 to next</div>
        </div>
      `;
    });
    grid.innerHTML = html;
  } catch (e) {
    console.error('loadProfile error:', e);
  }
}

async function loadWeeklyProgress(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return;

    const data = doc.data();
    const weekStart = getWeekStartString();

    // Ensure weeklyMuscles is current (in case reset hasn't run yet this session)
    let weeklyMuscles = data.weeklyMuscles || emptyMuscles();
    let weeklyXP = data.weeklyXP || 0;
    if (data.lastWeeklyReset !== weekStart) {
      weeklyMuscles = emptyMuscles();
      weeklyXP = 0;
    }

    // Header
    const header = document.getElementById('weekly-header');
    if (header) {
      header.innerHTML = `
        <strong>This week</strong><br>
        Total weekly XP: <span style="color:#00ff88">${weeklyXP}</span>
      `;
    }

    // Muscle grid – sort by weekly XP descending
    const grid = document.getElementById('weekly-muscle-grid');
    if (!grid) return;

    const sorted = ALL_MUSCLES
      .map(name => ({ name, xp: weeklyMuscles[name] || 0 }))
      .sort((a, b) => b.xp - a.xp);

    const maxXP = Math.max(...sorted.map(m => m.xp), 1); // avoid division by 0

    let html = '';
    sorted.forEach(({ name, xp }) => {
      const pct = Math.round((xp / maxXP) * 100);
      const isZero = xp === 0;
      html += `
        <div class="muscle-card ${isZero ? 'muscle-zero' : ''}">
          <div class="muscle-name">${name}</div>
          <div class="muscle-xp">${xp} XP this week</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="muscle-next">${isZero ? 'Not worked yet' : `${pct}% of top muscle`}</div>
        </div>
      `;
    });
    grid.innerHTML = html;
  } catch (e) {
    console.error('loadWeeklyProgress error:', e);
  }
}

function formatSetDate(timestamp) {
  if (!timestamp || !timestamp.toDate) return '—';
  const d = timestamp.toDate();
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/Lisbon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadHistory(uid) {
  const listEl = document.getElementById('sets-list');
  if (!listEl) return;

  listEl.innerHTML = '<p class="hint">Loading…</p>';

  try {
    const snap = await db.collection('users').doc(uid).collection('sets')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();

    if (snap.empty) {
      listEl.innerHTML = '<p class="hint">No sets logged yet. Confirm a set on the Workout tab!</p>';
      return;
    }

    let html = '';
    snap.forEach(doc => {
      const s = doc.data();
      html += `
        <div class="set-card">
          <div class="set-exercise">${s.exercise || '—'}</div>
          <div class="set-details">
            <span>${s.weight ?? '—'} kg</span>
            <span>×</span>
            <span>${s.reps ?? '—'} reps</span>
          </div>
          <div class="set-xp">+${s.xp ?? 0} XP</div>
          <div class="set-date">${formatSetDate(s.createdAt)}</div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    console.error('loadHistory error:', e);
    listEl.innerHTML = '<p class="hint">Could not load history. Check console for details.</p>';
  }
}

function setupWorkoutListeners() {
  if (workoutListenerAttached) return;
  const btn = document.getElementById('confirm-btn');
  if (btn) {
    btn.addEventListener('click', logWorkout);
  }
  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', undoLastSet);
  }
  workoutListenerAttached = true;
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
  const xpGain = Math.floor(reps * Math.pow(weight * factor, 2));

  // Muscle distribution for this exercise
  const muscleMap = exerciseMuscles[exercise] || {};
  const muscleGains = {};
  for (const [muscle, pct] of Object.entries(muscleMap)) {
    muscleGains[muscle] = Math.floor(xpGain * (pct / 100));
  }

  // ── Confirmation dialog (requires OK) ───────────────────
  const musclePreview = Object.entries(muscleGains)
    .filter(([, g]) => g > 0)
    .map(([m, g]) => `${m} +${g}`)
    .join(', ');
  const confirmMsg =
    `Confirm this set?\n\n` +
    `${exercise}\n` +
    `${weight} kg × ${reps} reps\n` +
    `+${xpGain} XP` +
    (musclePreview ? `\n(${musclePreview})` : '') +
    `\n\nClick OK to save, or Cancel to abort.`;
  if (!confirm(confirmMsg)) {
    return; // user cancelled
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

    const strengthGain = Math.floor(xpGain / 30);
    const newStrength = Math.floor((data.strength || 10) + strengthGain);

    // Merge lifetime muscle XP
    const currentMuscles = data.muscles || emptyMuscles();
    const updatedMuscles = { ...currentMuscles };
    for (const [muscle, gain] of Object.entries(muscleGains)) {
      updatedMuscles[muscle] = (updatedMuscles[muscle] || 0) + gain;
    }

    // Reset dailyXP / weeklyXP / weeklyMuscles if the period has changed, then add the gain
    const today = getTodayString();
    const weekStart = getWeekStartString();

    let dailyXP = data.dailyXP || 0;
    if (data.lastDailyReset !== today) {
      dailyXP = 0;
    }
    dailyXP += xpGain;

    let weeklyXP = data.weeklyXP || 0;
    let currentWeeklyMuscles = data.weeklyMuscles || emptyMuscles();
    if (data.lastWeeklyReset !== weekStart) {
      weeklyXP = 0;
      currentWeeklyMuscles = emptyMuscles();
    }
    weeklyXP += xpGain;

    // Merge weekly muscle XP
    const updatedWeeklyMuscles = { ...currentWeeklyMuscles };
    for (const [muscle, gain] of Object.entries(muscleGains)) {
      updatedWeeklyMuscles[muscle] = (updatedWeeklyMuscles[muscle] || 0) + gain;
    }

    await userRef.update({
      xp: newXP,
      level: newLevel,
      strength: newStrength,
      dailyXP: dailyXP,
      lastDailyReset: today,
      weeklyXP: weeklyXP,
      lastWeeklyReset: weekStart,
      muscles: updatedMuscles,
      weeklyMuscles: updatedWeeklyMuscles
    });

    // Save individual set for History page
    const setsRef = userRef.collection('sets');
    const setDocRef = await setsRef.add({
      exercise: exercise,
      weight: weight,
      reps: reps,
      xp: xpGain,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Keep only the newest 30 sets – delete the oldest ones if over limit
    const allSetsSnap = await setsRef.orderBy('createdAt', 'asc').get();
    if (allSetsSnap.size > 30) {
      const excess = allSetsSnap.size - 30;
      const batch = db.batch();
      allSetsSnap.docs.slice(0, excess).forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    // Store everything needed for a perfect undo
    lastLoggedSet = {
      setId: setDocRef.id,
      xpGain,
      strengthGain,
      muscleGains,
      exercise,
      weight,
      reps
    };

    // Show the Undo button
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.style.display = 'inline-block';

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

async function undoLastSet() {
  if (!lastLoggedSet || !currentUser) {
    alert('Nothing to undo.');
    return;
  }

  const { setId, xpGain, strengthGain, muscleGains, exercise, weight, reps } = lastLoggedSet;

  if (!confirm(
    `Undo the last set?\n\n` +
    `${exercise}\n` +
    `${weight} kg × ${reps} reps\n` +
    `−${xpGain} XP\n\n` +
    `This cannot be undone again. Click OK to confirm.`
  )) {
    return;
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      alert('User data not found.');
      return;
    }
    const data = doc.data();

    // Subtract XP and recalculate level from the new total
    let newXP = Math.max(0, (data.xp || 0) - xpGain);
    let newLevel = 1;
    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 100) {
      newLevel++;
    }

    // Subtract strength (never go below 10)
    const newStrength = Math.max(10, (data.strength || 10) - strengthGain);

    // Subtract muscle XP (lifetime)
    const updatedMuscles = { ...(data.muscles || emptyMuscles()) };
    for (const [muscle, gain] of Object.entries(muscleGains)) {
      updatedMuscles[muscle] = Math.max(0, (updatedMuscles[muscle] || 0) - gain);
    }

    // Subtract weekly muscle XP
    const updatedWeeklyMuscles = { ...(data.weeklyMuscles || emptyMuscles()) };
    for (const [muscle, gain] of Object.entries(muscleGains)) {
      updatedWeeklyMuscles[muscle] = Math.max(0, (updatedWeeklyMuscles[muscle] || 0) - gain);
    }

    // Subtract daily / weekly XP (floor at 0)
    const newDailyXP = Math.max(0, (data.dailyXP || 0) - xpGain);
    const newWeeklyXP = Math.max(0, (data.weeklyXP || 0) - xpGain);

    await userRef.update({
      xp: newXP,
      level: newLevel,
      strength: newStrength,
      dailyXP: newDailyXP,
      weeklyXP: newWeeklyXP,
      muscles: updatedMuscles,
      weeklyMuscles: updatedWeeklyMuscles
    });

    // Delete the exact set document
    await userRef.collection('sets').doc(setId).delete();

    // Clear undo state and hide button
    lastLoggedSet = null;
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.style.display = 'none';

    const logMsg = document.getElementById('log-message');
    if (logMsg) {
      logMsg.innerHTML = `↩️ Last set undone (−${xpGain} XP)`;
    }

    await loadUserData(currentUser.uid);
    loadLeaderboards();

    // Refresh history if that tab is currently visible
    const historySection = document.getElementById('history');
    if (historySection && historySection.style.display !== 'none') {
      loadHistory(currentUser.uid);
    }

  } catch (error) {
    console.error('Undo error:', error);
    alert('Error undoing the set. Please try again.');
  }
}

async function loadLeaderboards() {
  // ── Global (by Level) ───────────────────────────────────
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
  } catch (e) {
    console.error('Global leaderboard error:', e);
  }

  // ── Daily (by highest dailyXP) – only active players ────
  try {
    const today = getTodayString();
    const dailySnap = await db.collection('users')
      .orderBy('dailyXP', 'desc')
      .limit(30) // fetch more so we can filter down to 10 active
      .get();

    let dailyHTML = '<h3>📅 Daily Top 10</h3><ol>';
    let count = 0;

    dailySnap.forEach(doc => {
      if (count >= 10) return;
      const d = doc.data();
      // Only show players who are active today
      if (d.lastDailyReset === today) {
        dailyHTML += `<li>${d.nickname} — ${d.dailyXP || 0} XP</li>`;
        count++;
      }
    });

    if (count === 0) {
      dailyHTML += '<li>No active players today yet</li>';
    }
    dailyHTML += '</ol>';
    const dailyLb = document.getElementById('daily-lb');
    if (dailyLb) dailyLb.innerHTML = dailyHTML;
  } catch (e) {
    console.error('Daily leaderboard error:', e);
  }

  // ── Weekly (by highest weeklyXP) – only active players ──
  try {
    const weekStart = getWeekStartString();
    const weeklySnap = await db.collection('users')
      .orderBy('weeklyXP', 'desc')
      .limit(30) // fetch more so we can filter down to 10 active
      .get();

    let weeklyHTML = '<h3>📆 Weekly Top 10</h3><ol>';
    let count = 0;

    weeklySnap.forEach(doc => {
      if (count >= 10) return;
      const d = doc.data();
      // Only show players who are active this week
      if (d.lastWeeklyReset === weekStart) {
        weeklyHTML += `<li>${d.nickname} — ${d.weeklyXP || 0} XP</li>`;
        count++;
      }
    });

    if (count === 0) {
      weeklyHTML += '<li>No active players this week yet</li>';
    }
    weeklyHTML += '</ol>';
    const weeklyLb = document.getElementById('weekly-lb');
    if (weeklyLb) weeklyLb.innerHTML = weeklyHTML;
  } catch (e) {
    console.error('Weekly leaderboard error:', e);
  }
}
