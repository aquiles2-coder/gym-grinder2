let db, auth, currentUser = null;
let workoutListenerAttached = false;
let tabsListenerAttached = false;
let lastLoggedSet = null; // stores the most recent workout set so we can undo it
let lastLoggedCardio = null; // stores the most recent cardio session so we can undo it

// Train Builder / Pre-prepared Trains state
let editingTrainId = null;          // null = creating new, string = editing existing
let currentTrainSession = null;     // the train object currently being performed
const MAX_TRAINS_PER_PLAYER = 6;
const MIN_EXERCISES_PER_TRAIN = 3;
const MAX_EXERCISES_PER_TRAIN = 10;

// ─── Custom Modal System (replaces alert / confirm / prompt) ───
let _modalResolve = null;

function _getModalEls() {
  return {
    overlay: document.getElementById('modal-overlay'),
    title: document.getElementById('modal-title'),
    body: document.getElementById('modal-body'),
    okBtn: document.getElementById('modal-ok'),
    cancelBtn: document.getElementById('modal-cancel')
  };
}

function _closeModal(result) {
  const { overlay, okBtn, cancelBtn } = _getModalEls();
  if (!overlay) return;
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  // Clear listeners by cloning buttons
  const newOk = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  const newCancel = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
  if (_modalResolve) {
    const resolve = _modalResolve;
    _modalResolve = null;
    resolve(result);
  }
}

/**
 * Core modal. Returns a Promise.
 * options = {
 *   type: 'alert' | 'confirm' | 'form',
 *   title: string,
 *   message: string (for alert/confirm),
 *   fields: [{ id, label, type, placeholder, value? }] (for form),
 *   okText: string,
 *   cancelText: string
 * }
 * Resolves: undefined (alert), true/false (confirm), object|null (form)
 */
function showModal(options = {}) {
  return new Promise((resolve) => {
    const { overlay, title, body, okBtn, cancelBtn } = _getModalEls();
    if (!overlay) {
      // Fallback if modal HTML is missing
      if (options.type === 'confirm') resolve(window.confirm(options.message || ''));
      else if (options.type === 'form') resolve(null);
      else { window.alert(options.message || ''); resolve(); }
      return;
    }

    _modalResolve = resolve;

    title.textContent = options.title || 'Gym Grinder';
    okBtn.textContent = options.okText || 'OK';
    cancelBtn.textContent = options.cancelText || 'Cancel';

    // Build body
    body.innerHTML = '';
    if (options.type === 'form' && Array.isArray(options.fields)) {
      const form = document.createElement('div');
      form.className = 'modal-form';
      options.fields.forEach(f => {
        const label = document.createElement('label');
        label.htmlFor = 'modal-field-' + f.id;
        label.textContent = f.label || f.id;
        const input = document.createElement('input');
        input.id = 'modal-field-' + f.id;
        input.type = f.type || 'text';
        input.placeholder = f.placeholder || '';
        if (f.value != null) input.value = f.value;
        input.autocomplete = f.type === 'password' ? 'current-password' : 'off';
        form.appendChild(label);
        form.appendChild(input);
      });
      const err = document.createElement('div');
      err.className = 'modal-error';
      err.id = 'modal-form-error';
      form.appendChild(err);
      body.appendChild(form);
    } else {
      // alert / confirm – support multi-line
      body.textContent = options.message || '';
    }

    // Show / hide cancel
    if (options.type === 'alert') {
      cancelBtn.style.display = 'none';
    } else {
      cancelBtn.style.display = 'inline-block';
    }

    // Event handlers (re-query after potential previous clone)
    const els = _getModalEls();
    els.okBtn.onclick = () => {
      if (options.type === 'form') {
        const values = {};
        let valid = true;
        options.fields.forEach(f => {
          const input = document.getElementById('modal-field-' + f.id);
          values[f.id] = input ? input.value.trim() : '';
        });
        // Basic required check
        for (const f of options.fields) {
          if (!values[f.id]) {
            const errEl = document.getElementById('modal-form-error');
            if (errEl) errEl.textContent = 'Please fill in all fields.';
            valid = false;
            break;
          }
        }
        if (!valid) return;
        _closeModal(values);
      } else if (options.type === 'confirm') {
        _closeModal(true);
      } else {
        _closeModal();
      }
    };

    els.cancelBtn.onclick = () => {
      if (options.type === 'confirm') _closeModal(false);
      else _closeModal(null);
    };

    // Enter key submits, Escape cancels
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler);
        if (options.type === 'confirm') _closeModal(false);
        else if (options.type === 'form') _closeModal(null);
        else _closeModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        els.okBtn.click();
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Also remove key handler when closed
    const originalResolve = _modalResolve;
    _modalResolve = (result) => {
      document.removeEventListener('keydown', keyHandler);
      originalResolve(result);
    };

    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');

    // Focus first input or OK button
    if (options.type === 'form') {
      const first = document.getElementById('modal-field-' + options.fields[0].id);
      if (first) setTimeout(() => first.focus(), 50);
    } else {
      setTimeout(() => els.okBtn.focus(), 50);
    }
  });
}

function showAlert(message, title = 'Gym Grinder') {
  return showModal({ type: 'alert', title, message });
}

function showConfirm(message, title = 'Confirm') {
  return showModal({ type: 'confirm', title, message, okText: 'OK', cancelText: 'Cancel' });
}

function showLoginForm() {
  return showModal({
    type: 'form',
    title: 'Login',
    fields: [
      { id: 'nickname', label: 'Nickname', type: 'text', placeholder: 'Enter Nickname' },
      { id: 'password', label: 'Password', type: 'password', placeholder: 'Enter Password' }
    ],
    okText: 'Login',
    cancelText: 'Cancel'
  });
}

function showRegisterForm() {
  return showModal({
    type: 'form',
    title: 'Register',
    fields: [
      { id: 'nickname', label: 'Nickname', type: 'text', placeholder: 'Choose a Nickname' },
      { id: 'password', label: 'Password (min 6 chars)', type: 'password', placeholder: 'Choose a Password' },
      { id: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: 'Confirm Password' }
    ],
    okText: 'Create Account',
    cancelText: 'Cancel'
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Safety check: Firebase must be loaded
  if (typeof firebase === 'undefined') {
    showAlert('Firebase failed to load. Check your internet connection and firebase-config.js');
    console.error('Firebase is not defined');
    return;
  }

  try {
    auth = firebase.auth();
    db = firebase.firestore();
  } catch (e) {
    showAlert('Error initializing Firebase: ' + e.message);
    console.error(e);
    return;
  }

  populateExercises();
  populateCardioExercises();
  setupAuthListeners();
  setupLogout();
  setupTabs();

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      hide('auth-section');
      show('logout-btn', 'inline-block');

      try {
        const doc = await db.collection('users').doc(user.uid).get();

        if (!doc.exists) {
          // Document missing – force logout so user can re-register cleanly
          console.error('User document not found');
          await auth.signOut();
          return;
        }

        const data = doc.data();

        if (data.approved === true) {
          // Approved → show the game
          hide('pending-section');
          show('main-game', 'block');
          await loadUserData(user.uid);
          setupWorkoutListeners();
          loadLeaderboards();
        } else {
          // Not yet approved → show waiting screen
          hide('main-game');
          show('pending-section', 'block');
        }
      } catch (err) {
        console.error('Error checking approval status:', err);
        hide('main-game');
        show('pending-section', 'block');
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
  "Forearms", "Core", "Quads", "Hamstrings", "Glutes", "Calves", "Cardio"
];

// Percentage of XP that goes to each muscle (must sum to 100)
// Ordered alphabetically
const exerciseMuscles = {
  "Bench Press 2 arms":             { Chest: 55, Triceps: 25, Shoulders: 20 },
  "Bent-over Row 2 arms":           { Back: 70, Biceps: 15, Shoulders: 10, Forearms: 5 },
  "Biceps Curl 1 arm":              { Biceps: 85, Forearms: 15 },
  "Bulgarian Split Squat 1 leg bodyweight": { Quads: 40, Glutes: 30, Hamstrings: 20, Core: 10 },
  "Chest Fly 1 arm":                { Chest: 90, Shoulders: 10 },
  "Chin Ups bodyweight":            { Back: 45, Biceps: 40, Forearms: 10, Core: 5 },
  "Crunches":                       { Core: 100 },
  "Deadlift 2 arms":                { Back: 35, Hamstrings: 25, Glutes: 25, Quads: 10, Core: 5 },
  "Dip bodyweight":                 { Chest: 40, Triceps: 40, Shoulders: 15, Core: 5 },
  "Glute Kickback Machine 1 leg":   { Glutes: 75, Hamstrings: 20, Core: 5 },
  "Hammer Curl 1 arm":              { Biceps: 60, Forearms: 40 },
  "Hip Abduction 2 legs":           { Glutes: 85, Core: 15 },
  "Incline Bench Press 2 arms":     { Chest: 50, Shoulders: 30, Triceps: 20 },
  "Lateral Raise 1 arm":            { Shoulders: 90, Forearms: 10 },
  "Leg Abduction 2 legs":           { Glutes: 80, Quads: 10, Core: 10 },
  "Leg Curl 2 legs":                { Hamstrings: 85, Calves: 15 },
  "Leg Extension 2 legs":           { Quads: 90, Core: 10 },
  "Leg Press 2 legs":               { Quads: 50, Glutes: 30, Hamstrings: 15, Calves: 5 },
  "Lying Leg Raises bodyweight":    { Core: 85, Quads: 15 },
  "Lying Triceps Extension 2 arms": { Triceps: 90, Forearms: 10 },
  "Pull Ups bodyweight":            { Back: 60, Biceps: 25, Forearms: 10, Core: 5 },
  "Pull-down 2 arms":               { Back: 75, Biceps: 20, Forearms: 5 },
  "Push Ups bodyweight":            { Chest: 50, Triceps: 25, Shoulders: 15, Core: 10 },
  "Push-down 2 arms":               { Triceps: 85, Forearms: 15 },
  "Seated Calf Raises 2 legs":      { Calves: 100 },
  "Shoulder Press 2 arms":          { Shoulders: 70, Triceps: 20, Chest: 10 },
  "Squat bodyweight":               { Quads: 40, Glutes: 30, Hamstrings: 15, Core: 10, Calves: 5 },
  "Standing Calf Raises bodyweight":{ Calves: 100 },
  "Wrist Curls 1 hand":             { Forearms: 100 },
  "Wrist Extension 1 hand":         { Forearms: 100 }
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
  "Bulgarian Split Squat 1 leg bodyweight": 0.10,
  "Chest Fly 1 arm": 0.70,
  "Chin Ups bodyweight": 0.14,
  "Crunches": 0.2,
  "Deadlift 2 arms": 0.10,
  "Dip bodyweight": 0.13,
  "Glute Kickback Machine 1 leg": 0.30,
  "Hammer Curl 1 arm": 0.70,
  "Hip Abduction 2 legs": 0.12,
  "Incline Bench Press 2 arms": 0.19,
  "Lateral Raise 1 arm": 1.00,
  "Leg Abduction 2 legs": 0.11,
  "Leg Curl 2 legs": 0.25,
  "Leg Extension 2 legs": 0.16,
  "Leg Press 2 legs": 0.07,
  "Lying Leg Raises bodyweight": 0.12,
  "Lying Triceps Extension 2 arms": 0.38,
  "Pull Ups bodyweight": 0.15,
  "Pull-down 2 arms": 0.19,
  "Push Ups bodyweight": 0.106,
  "Push-down 2 arms": 0.29,
  "Seated Calf Raises 2 legs": 0.15,
  "Shoulder Press 2 arms": 0.26,
  "Squat bodyweight": 0.076,
  "Standing Calf Raises bodyweight": 0.06,
  "Wrist Curls 1 hand": 0.43,
  "Wrist Extension 1 hand": 0.39
};

// Cardio coefficients – XP = coefficient * kilometers * 20000
const cardioCoefficients = {
  "Stair": 1.00,
  "Swim": 0.242,
  "Run": 0.082,
  "Walk": 0.063,
  "Row": 0.047,
  "Bicycle": 0.033
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

function populateCardioExercises() {
  const select = document.getElementById('cardio-select');
  if (!select) return;

  select.innerHTML = '';

  // Keep order from the coefficients table (Stair first as highest)
  const exercises = Object.keys(cardioCoefficients);
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
        await showAlert('Logged out successfully!');
      } catch (error) {
        await showAlert('Error logging out: ' + error.message);
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
      if (tab === 'builder' && currentUser) {
        loadBuilder();
      }
      if (tab === 'trains' && currentUser) {
        loadTrainsList();
      }
    });
  });
  tabsListenerAttached = true;
}

async function handleLogin() {
  const result = await showLoginForm();
  if (!result) return; // user cancelled

  const { nickname, password } = result;
  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    await auth.signInWithEmailAndPassword(email, password);
    await showAlert('✅ Login successful!');
  } catch (error) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      await showAlert('Account not found or wrong password. Please Register first or check your details.');
    } else if (error.code === 'auth/wrong-password') {
      await showAlert('Wrong password.');
    } else {
      await showAlert('Login error: ' + error.message);
    }
  }
}

async function handleRegister() {
  const result = await showRegisterForm();
  if (!result) return; // user cancelled

  const { nickname, password, confirmPassword } = result;

  if (password.length < 6) {
    await showAlert('Password must be at least 6 characters!');
    return;
  }
  if (password !== confirmPassword) {
    await showAlert('Passwords do not match!');
    return;
  }

  const email = `${nickname.toLowerCase().replace(/\s+/g, '')}@gymgrinder.app`;

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(userCred.user.uid).set({
      nickname: nickname,
      level: 1,
      xp: 0,
      strength: 10,
      approved: false,          // new players start locked until admin approves
      dailyXP: 0,
      weeklyXP: 0,
      lastDailyReset: getTodayString(),
      lastWeeklyReset: getWeekStartString(),
      muscles: emptyMuscles(),
      weeklyMuscles: emptyMuscles()
    });
    await showAlert('✅ Account created!\n\nWaiting for admin approval.\nYou will be able to play once an admin activates your account.');
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      await showAlert('This nickname is already taken. Please choose another one.');
    } else {
      await showAlert('Registration error: ' + error.message);
    }
  }
}

async function loadUserData(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      const nextLevelXP = calculateCumulativeXP(data.level || 1) + (data.level || 1) * 1000;
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

      // Ensure muscles object has every entry from ALL_MUSCLES (e.g. newly added Cardio)
      const ensureFull = (m) => {
        const full = emptyMuscles();
        if (m) Object.assign(full, m);
        return full;
      };
      const fullMuscles = ensureFull(data.muscles);
      const fullWeekly = ensureFull(data.weeklyMuscles);
      // Only write if something was missing
      if (!data.muscles || Object.keys(data.muscles).length < ALL_MUSCLES.length) {
        updates.muscles = fullMuscles;
      }
      if (!data.weeklyMuscles || Object.keys(data.weeklyMuscles).length < ALL_MUSCLES.length) {
        updates.weeklyMuscles = fullWeekly;
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
  for (let i = 1; i < level; i++) total += i * 1000;
  return total;
}

function muscleLevel(xp) {
  // Simple level: every 5000 XP = 1 muscle level
  return Math.floor((xp || 0) / 5000) + 1;
}

function muscleProgress(xp) {
  // XP toward next muscle level (0–4999)
  return ((xp || 0) % 5000);
}

async function loadProfile(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return;

    const data = doc.data();
    const muscles = data.muscles || emptyMuscles();
    const nextLevelXP = calculateCumulativeXP(data.level || 1) + (data.level || 1) * 1000;

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
      const progPct = Math.floor((prog / 5000) * 100);
      html += `
        <div class="muscle-card">
          <div class="muscle-name">${name}</div>
          <div class="muscle-level">Lv ${lvl}</div>
          <div class="muscle-xp">${xp} XP</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progPct}%"></div>
          </div>
          <div class="muscle-next">${prog}/5000 to next</div>
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
      const isCardio = s.type === 'cardio';
      const details = isCardio
        ? `<span>${s.kilometers ?? '—'} km</span>`
        : `<span>${s.weight ?? '—'} kg</span><span>×</span><span>${s.reps ?? '—'} reps</span>`;
      const trainBadge = s.trainName
        ? `<div class="set-train">📋 ${s.trainName}</div>`
        : '';
      html += `
        <div class="set-card">
          ${trainBadge}
          <div class="set-exercise">${s.exercise || '—'}${isCardio ? ' 🏃' : ''}</div>
          <div class="set-details">
            ${details}
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
  // Cardio listeners
  const cardioBtn = document.getElementById('cardio-confirm-btn');
  if (cardioBtn) {
    cardioBtn.addEventListener('click', logCardio);
  }
  const cardioUndoBtn = document.getElementById('cardio-undo-btn');
  if (cardioUndoBtn) {
    cardioUndoBtn.addEventListener('click', undoLastCardio);
  }
  workoutListenerAttached = true;
}

async function logWorkout() {
  const exercise = document.getElementById('exercise-select').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const reps = parseInt(document.getElementById('reps').value);

  if (isNaN(weight) || isNaN(reps) || reps < 1) {
    await showAlert('Please enter valid weight and reps!');
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
  if (!(await showConfirm(confirmMsg))) {
    return; // user cancelled
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    const data = doc.data();

    let newXP = (data.xp || 0) + xpGain;
    let newLevel = data.level || 1;

    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 1000) {
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
    await showAlert('Error saving workout.');
  }
}

async function undoLastSet() {
  if (!lastLoggedSet || !currentUser) {
    await showAlert('Nothing to undo.');
    return;
  }

  const { setId, xpGain, strengthGain, muscleGains, exercise, weight, reps } = lastLoggedSet;

  if (!(await showConfirm(
    `Undo the last set?\n\n` +
    `${exercise}\n` +
    `${weight} kg × ${reps} reps\n` +
    `−${xpGain} XP\n\n` +
    `This cannot be undone again. Click OK to confirm.`
  ))) {
    return;
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      await showAlert('User data not found.');
      return;
    }
    const data = doc.data();

    // Subtract XP and recalculate level from the new total
    let newXP = Math.max(0, (data.xp || 0) - xpGain);
    let newLevel = 1;
    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 1000) {
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
    await showAlert('Error undoing the set. Please try again.');
  }
}

async function logCardio() {
  const exercise = document.getElementById('cardio-select').value;
  const km = parseFloat(document.getElementById('kilometers').value);

  if (isNaN(km) || km <= 0) {
    await showAlert('Please enter a valid distance in kilometers!');
    return;
  }

  const coeff = cardioCoefficients[exercise] ?? 0.05;
  const xpGain = Math.floor(coeff * km * 20000);

  // Cardio XP goes 100% to the fictitious "Cardio" body part
  const muscleGains = { Cardio: xpGain };

  // ── Confirmation dialog ─────────────────────────────────
  const confirmMsg =
    `Confirm this cardio session?\n\n` +
    `${exercise}\n` +
    `${km} km\n` +
    `+${xpGain} XP\n` +
    `(Cardio +${xpGain})\n\n` +
    `Click OK to save, or Cancel to abort.`;
  if (!(await showConfirm(confirmMsg))) {
    return;
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    const data = doc.data();

    let newXP = (data.xp || 0) + xpGain;
    let newLevel = data.level || 1;

    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 1000) {
      newLevel++;
    }

    const strengthGain = Math.floor(xpGain / 30);
    const newStrength = Math.floor((data.strength || 10) + strengthGain);

    // Merge lifetime muscle XP (only Cardio)
    const currentMuscles = data.muscles || emptyMuscles();
    const updatedMuscles = { ...currentMuscles };
    updatedMuscles.Cardio = (updatedMuscles.Cardio || 0) + xpGain;

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

    // Merge weekly muscle XP (only Cardio)
    const updatedWeeklyMuscles = { ...currentWeeklyMuscles };
    updatedWeeklyMuscles.Cardio = (updatedWeeklyMuscles.Cardio || 0) + xpGain;

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

    // Save individual session for History page
    const setsRef = userRef.collection('sets');
    const setDocRef = await setsRef.add({
      type: 'cardio',
      exercise: exercise,
      kilometers: km,
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
    lastLoggedCardio = {
      setId: setDocRef.id,
      xpGain,
      strengthGain,
      muscleGains,
      exercise,
      kilometers: km
    };

    // Show the Undo button
    const undoBtn = document.getElementById('cardio-undo-btn');
    if (undoBtn) undoBtn.style.display = 'inline-block';

    const logMsg = document.getElementById('cardio-log-message');
    if (logMsg) {
      logMsg.innerHTML = `✅ +${xpGain} XP from ${exercise} (${km} km)!<br><span class="muscle-gains">Cardio +${xpGain}</span>`;
    }
    await loadUserData(currentUser.uid);
    loadLeaderboards();

  } catch (error) {
    console.error('Cardio error:', error);
    await showAlert('Error saving cardio session.');
  }
}

async function undoLastCardio() {
  if (!lastLoggedCardio || !currentUser) {
    await showAlert('Nothing to undo.');
    return;
  }

  const { setId, xpGain, strengthGain, muscleGains, exercise, kilometers } = lastLoggedCardio;

  if (!(await showConfirm(
    `Undo the last cardio session?\n\n` +
    `${exercise}\n` +
    `${kilometers} km\n` +
    `−${xpGain} XP\n\n` +
    `This cannot be undone again. Click OK to confirm.`
  ))) {
    return;
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      await showAlert('User data not found.');
      return;
    }
    const data = doc.data();

    // Subtract XP and recalculate level from the new total
    let newXP = Math.max(0, (data.xp || 0) - xpGain);
    let newLevel = 1;
    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 1000) {
      newLevel++;
    }

    // Subtract strength (never go below 10)
    const newStrength = Math.max(10, (data.strength || 10) - strengthGain);

    // Subtract muscle XP (lifetime) – only Cardio
    const updatedMuscles = { ...(data.muscles || emptyMuscles()) };
    updatedMuscles.Cardio = Math.max(0, (updatedMuscles.Cardio || 0) - xpGain);

    // Subtract weekly muscle XP
    const updatedWeeklyMuscles = { ...(data.weeklyMuscles || emptyMuscles()) };
    updatedWeeklyMuscles.Cardio = Math.max(0, (updatedWeeklyMuscles.Cardio || 0) - xpGain);

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
    lastLoggedCardio = null;
    const undoBtn = document.getElementById('cardio-undo-btn');
    if (undoBtn) undoBtn.style.display = 'none';

    const logMsg = document.getElementById('cardio-log-message');
    if (logMsg) {
      logMsg.innerHTML = `↩️ Last cardio session undone (−${xpGain} XP)`;
    }

    await loadUserData(currentUser.uid);
    loadLeaderboards();

    // Refresh history if that tab is currently visible
    const historySection = document.getElementById('history');
    if (historySection && historySection.style.display !== 'none') {
      loadHistory(currentUser.uid);
    }

  } catch (error) {
    console.error('Cardio undo error:', error);
    await showAlert('Error undoing the cardio session. Please try again.');
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

// ═══════════════════════════════════════════════════════════
//  TRAIN BUILDER  +  PRE-PREPARED TRAINS
// ═══════════════════════════════════════════════════════════

/** Body parts available as tags (exclude Cardio) */
function getBodyPartOptions() {
  return ALL_MUSCLES.filter(m => m !== 'Cardio');
}

/** Sorted list of strength exercises */
function getExerciseNames() {
  return Object.keys(exerciseFactors).sort();
}

/** Fetch current user's nickname (cached on user doc) */
async function getCurrentNickname() {
  if (!currentUser) return 'Unknown';
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    return doc.exists ? (doc.data().nickname || 'Unknown') : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

// ─── BUILDER TAB ───────────────────────────────────────────

async function loadBuilder() {
  const listEl = document.getElementById('builder-my-trains');
  const statusEl = document.getElementById('builder-status');
  const createBtn = document.getElementById('builder-create-btn');
  const formEl = document.getElementById('builder-form');

  if (!listEl || !currentUser) return;

  // Hide form when switching back to list
  if (formEl) formEl.style.display = 'none';
  editingTrainId = null;

  listEl.innerHTML = '<p class="hint">Loading your trains…</p>';

  try {
    // No orderBy here to avoid composite-index requirement; sort client-side
    const snap = await db.collection('trains')
      .where('createdBy', '==', currentUser.uid)
      .get();

    const count = snap.size;
    if (statusEl) {
      statusEl.innerHTML = `Your trains: <strong>${count} / ${MAX_TRAINS_PER_PLAYER}</strong>`;
    }
    if (createBtn) {
      createBtn.style.display = count >= MAX_TRAINS_PER_PLAYER ? 'none' : 'inline-block';
      createBtn.onclick = () => showBuilderForm(null);
    }

    if (snap.empty) {
      listEl.innerHTML = '<p class="hint">You have no trains yet. Create one!</p>';
      return;
    }

    // Sort newest first
    const docs = snap.docs.slice().sort((a, b) => {
      const ta = a.data().createdAt?.toMillis?.() || 0;
      const tb = b.data().createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    let html = '';
    docs.forEach(doc => {
      const t = doc.data();
      const bodyTags = (t.bodyParts || []).map(b => `<span>${b}</span>`).join('');
      // Escape for HTML attribute (single quotes)
      const attrName = String(t.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      html += `
        <div class="train-card" data-id="${doc.id}">
          <div class="train-card-header">
            <div class="train-name">${escapeHtml(t.name)}</div>
          </div>
          <div class="train-meta">${(t.exercises || []).length} exercises</div>
          <div class="train-bodyparts">${bodyTags || '—'}</div>
          <div class="train-actions">
            <button type="button" class="btn-small" onclick="editTrain('${doc.id}')">Edit</button>
            <button type="button" class="btn-small btn-danger" onclick="deleteTrain('${doc.id}', '${attrName}')">Delete</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    console.error('loadBuilder error:', e);
    listEl.innerHTML = '<p class="hint">Could not load trains. Check console / Firestore rules.</p>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function editTrain(trainId) {
  try {
    const doc = await db.collection('trains').doc(trainId).get();
    if (!doc.exists) {
      await showAlert('Train not found.');
      return;
    }
    const data = doc.data();
    if (data.createdBy !== currentUser.uid) {
      await showAlert('You can only edit your own trains.');
      return;
    }
    showBuilderForm({ id: trainId, ...data });
  } catch (e) {
    console.error('editTrain error:', e);
    await showAlert('Error loading train.');
  }
}

async function deleteTrain(trainId, name) {
  if (!(await showConfirm(`Delete train "${name}"?\n\nThis cannot be undone.`))) return;

  try {
    const doc = await db.collection('trains').doc(trainId).get();
    if (!doc.exists) {
      await showAlert('Train already deleted.');
      loadBuilder();
      return;
    }
    if (doc.data().createdBy !== currentUser.uid) {
      await showAlert('You can only delete your own trains.');
      return;
    }
    await db.collection('trains').doc(trainId).delete();
    await showAlert('Train deleted.');
    loadBuilder();
  } catch (e) {
    console.error('deleteTrain error:', e);
    await showAlert('Error deleting train.');
  }
}

/**
 * Show the create / edit form.
 * trainData = null → create new
 * trainData = { id, name, bodyParts, exercises } → edit
 */
function showBuilderForm(trainData) {
  const formEl = document.getElementById('builder-form');
  const listEl = document.getElementById('builder-my-trains');
  const createBtn = document.getElementById('builder-create-btn');
  if (!formEl) return;

  editingTrainId = trainData ? trainData.id : null;

  // Hide list + create button while editing
  if (listEl) listEl.style.display = 'none';
  if (createBtn) createBtn.style.display = 'none';

  const isEdit = !!trainData;
  const nameVal = trainData ? escapeHtml(trainData.name) : '';
  const selectedParts = new Set(trainData ? (trainData.bodyParts || []) : []);
  const exercises = trainData ? (trainData.exercises || []) : [];

  // Body part chips
  let bodyHtml = '';
  getBodyPartOptions().forEach(part => {
    const checked = selectedParts.has(part) ? 'checked' : '';
    const selClass = selectedParts.has(part) ? 'selected' : '';
    bodyHtml += `
      <label class="bodypart-chip ${selClass}">
        <input type="checkbox" value="${part}" ${checked} onchange="this.parentElement.classList.toggle('selected', this.checked)">
        ${part}
      </label>
    `;
  });

  // Exercise rows
  let exHtml = '';
  if (exercises.length === 0) {
    // Start with 3 empty rows for convenience
    for (let i = 0; i < MIN_EXERCISES_PER_TRAIN; i++) {
      exHtml += buildExerciseRowHtml(i, null);
    }
  } else {
    exercises.forEach((ex, i) => {
      exHtml += buildExerciseRowHtml(i, ex);
    });
  }

  formEl.innerHTML = `
    <h3 style="color:#ffff00;margin-top:0;">${isEdit ? 'Edit Train' : 'New Train'}</h3>
    <div class="builder-field">
      <label for="train-name">Train name</label>
      <input type="text" id="train-name" maxlength="40" placeholder="e.g. Push Strength" value="${nameVal}">
    </div>
    <div class="builder-field">
      <label>Body parts focus (tags)</label>
      <div class="bodypart-grid" id="train-bodyparts">${bodyHtml}</div>
    </div>
    <div class="builder-field">
      <label>Exercises (min ${MIN_EXERCISES_PER_TRAIN}, max ${MAX_EXERCISES_PER_TRAIN}) — order matters</label>
      <div id="train-exercises-list">${exHtml}</div>
      <button type="button" class="btn-small" id="add-exercise-btn" onclick="addExerciseRow()">+ Add Exercise</button>
    </div>
    <div style="text-align:center;margin-top:16px;">
      <button type="button" class="btn-secondary btn-small" onclick="cancelBuilderForm()">Cancel</button>
      <button type="button" id="save-train-btn" onclick="saveTrain()">${isEdit ? 'Save Changes' : 'Save Train'}</button>
    </div>
  `;
  formEl.style.display = 'block';
}

function buildExerciseRowHtml(index, data) {
  const exerciseNames = getExerciseNames();
  let options = '<option value="">— select exercise —</option>';
  exerciseNames.forEach(name => {
    const sel = data && data.exercise === name ? 'selected' : '';
    options += `<option value="${escapeHtml(name)}" ${sel}>${escapeHtml(name)}</option>`;
  });
  const setsVal = data ? (data.sets || 3) : 3;
  const repsVal = data ? (data.suggestedReps || 10) : 10;

  return `
    <div class="exercise-row" data-index="${index}">
      <div class="exercise-row-header">
        <span>Exercise #${index + 1}</span>
        <button type="button" class="btn-small btn-danger" onclick="removeExerciseRow(this)">Remove</button>
      </div>
      <div class="row-inputs">
        <select class="ex-name">${options}</select>
        <label style="font-size:13px;color:#88ff88;">Sets</label>
        <input type="number" class="ex-sets" min="1" max="20" value="${setsVal}" style="width:70px;">
        <label style="font-size:13px;color:#88ff88;">Suggested reps</label>
        <input type="number" class="ex-reps" min="1" max="100" value="${repsVal}" style="width:70px;">
      </div>
    </div>
  `;
}

function addExerciseRow() {
  const list = document.getElementById('train-exercises-list');
  if (!list) return;
  const rows = list.querySelectorAll('.exercise-row');
  if (rows.length >= MAX_EXERCISES_PER_TRAIN) {
    showAlert(`Maximum ${MAX_EXERCISES_PER_TRAIN} exercises per train.`);
    return;
  }
  const idx = rows.length;
  list.insertAdjacentHTML('beforeend', buildExerciseRowHtml(idx, null));
  // Re-number headers
  renumberExerciseRows();
}

function removeExerciseRow(btn) {
  const row = btn.closest('.exercise-row');
  if (!row) return;
  const list = document.getElementById('train-exercises-list');
  const rows = list ? list.querySelectorAll('.exercise-row') : [];
  if (rows.length <= MIN_EXERCISES_PER_TRAIN) {
    showAlert(`Minimum ${MIN_EXERCISES_PER_TRAIN} exercises required.`);
    return;
  }
  row.remove();
  renumberExerciseRows();
}

function renumberExerciseRows() {
  const list = document.getElementById('train-exercises-list');
  if (!list) return;
  list.querySelectorAll('.exercise-row').forEach((row, i) => {
    row.dataset.index = i;
    const header = row.querySelector('.exercise-row-header span');
    if (header) header.textContent = `Exercise #${i + 1}`;
  });
}

function cancelBuilderForm() {
  const formEl = document.getElementById('builder-form');
  const listEl = document.getElementById('builder-my-trains');
  if (formEl) formEl.style.display = 'none';
  if (listEl) listEl.style.display = 'block';
  editingTrainId = null;
  loadBuilder(); // restores create button visibility
}

async function saveTrain() {
  if (!currentUser) return;

  const nameInput = document.getElementById('train-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    await showAlert('Please enter a train name.');
    return;
  }
  if (name.length > 40) {
    await showAlert('Name is too long (max 40 characters).');
    return;
  }

  // Body parts
  const bodyParts = [];
  document.querySelectorAll('#train-bodyparts input[type="checkbox"]:checked').forEach(cb => {
    bodyParts.push(cb.value);
  });

  // Exercises
  const exerciseRows = document.querySelectorAll('#train-exercises-list .exercise-row');
  if (exerciseRows.length < MIN_EXERCISES_PER_TRAIN) {
    await showAlert(`You need at least ${MIN_EXERCISES_PER_TRAIN} exercises.`);
    return;
  }
  if (exerciseRows.length > MAX_EXERCISES_PER_TRAIN) {
    await showAlert(`Maximum ${MAX_EXERCISES_PER_TRAIN} exercises.`);
    return;
  }

  const exercises = [];
  const usedNames = new Set();
  for (const row of exerciseRows) {
    const sel = row.querySelector('.ex-name');
    const setsInp = row.querySelector('.ex-sets');
    const repsInp = row.querySelector('.ex-reps');
    const exercise = sel ? sel.value : '';
    const sets = setsInp ? parseInt(setsInp.value, 10) : 0;
    const suggestedReps = repsInp ? parseInt(repsInp.value, 10) : 0;

    if (!exercise) {
      await showAlert('Please select an exercise for every row.');
      return;
    }
    if (isNaN(sets) || sets < 1) {
      await showAlert(`Invalid sets for "${exercise}".`);
      return;
    }
    if (isNaN(suggestedReps) || suggestedReps < 1) {
      await showAlert(`Invalid suggested reps for "${exercise}".`);
      return;
    }
    // Allow same exercise multiple times? Yes – different set schemes possible.
    exercises.push({ exercise, sets, suggestedReps });
  }

  try {
    // Check max trains when creating
    if (!editingTrainId) {
      const mySnap = await db.collection('trains')
        .where('createdBy', '==', currentUser.uid)
        .get();
      if (mySnap.size >= MAX_TRAINS_PER_PLAYER) {
        await showAlert(`You already have ${MAX_TRAINS_PER_PLAYER} trains. Delete one first.`);
        return;
      }
    }

    // Unique name per player (case-insensitive)
    const nameLower = name.toLowerCase();
    const nameCheck = await db.collection('trains')
      .where('createdBy', '==', currentUser.uid)
      .get();
    let duplicate = false;
    nameCheck.forEach(doc => {
      if (doc.id === editingTrainId) return;
      if ((doc.data().name || '').toLowerCase() === nameLower) duplicate = true;
    });
    if (duplicate) {
      await showAlert('You already have a train with this name. Choose a different name.');
      return;
    }

    const nickname = await getCurrentNickname();
    const payload = {
      name,
      bodyParts,
      exercises,
      createdBy: currentUser.uid,
      createdByNickname: nickname,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (editingTrainId) {
      await db.collection('trains').doc(editingTrainId).update(payload);
      await showAlert('Train updated!');
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('trains').add(payload);
      await showAlert('Train created! It is now available for every player.');
    }

    cancelBuilderForm();
  } catch (e) {
    console.error('saveTrain error:', e);
    await showAlert('Error saving train: ' + e.message);
  }
}

// ─── TRAINS TAB (use a train) ──────────────────────────────

async function loadTrainsList() {
  const listEl = document.getElementById('trains-list');
  const sessionEl = document.getElementById('trains-session');
  if (!listEl) return;

  // Reset session view
  if (sessionEl) {
    sessionEl.style.display = 'none';
    sessionEl.innerHTML = '';
  }
  currentTrainSession = null;
  listEl.style.display = 'block';
  listEl.innerHTML = '<p class="hint">Loading trains…</p>';

  try {
    // Prefer ordered query; fall back to unordered if index missing
    let snap;
    try {
      snap = await db.collection('trains').orderBy('createdAt', 'desc').limit(50).get();
    } catch (orderErr) {
      console.warn('orderBy createdAt failed, falling back:', orderErr);
      snap = await db.collection('trains').limit(50).get();
    }

    if (snap.empty) {
      listEl.innerHTML = '<p class="hint">No trains created yet. Go to the Builder tab and make one!</p>';
      return;
    }

    // Client-side sort as safety
    const docs = snap.docs.slice().sort((a, b) => {
      const ta = a.data().createdAt?.toMillis?.() || 0;
      const tb = b.data().createdAt?.toMillis?.() || 0;
      return tb - ta;
    });

    let html = '';
    docs.forEach(doc => {
      const t = doc.data();
      const bodyTags = (t.bodyParts || []).map(b => `<span>${b}</span>`).join('');
      const exCount = (t.exercises || []).length;
      html += `
        <div class="train-card">
          <div class="train-card-header">
            <div class="train-name">${escapeHtml(t.name)}</div>
          </div>
          <div class="train-meta">by ${escapeHtml(t.createdByNickname || 'Unknown')} · ${exCount} exercises</div>
          <div class="train-bodyparts">${bodyTags || '—'}</div>
          <div class="train-actions">
            <button type="button" class="btn-small" onclick="startTrainSession('${doc.id}')">Use this train</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (e) {
    console.error('loadTrainsList error:', e);
    listEl.innerHTML = '<p class="hint">Could not load trains. Check console / Firestore rules.</p>';
  }
}

async function startTrainSession(trainId) {
  try {
    const doc = await db.collection('trains').doc(trainId).get();
    if (!doc.exists) {
      await showAlert('This train no longer exists.');
      loadTrainsList();
      return;
    }
    const train = { id: doc.id, ...doc.data() };
    if (!train.exercises || train.exercises.length < MIN_EXERCISES_PER_TRAIN) {
      await showAlert('This train is incomplete.');
      return;
    }

    currentTrainSession = train;

    const listEl = document.getElementById('trains-list');
    const sessionEl = document.getElementById('trains-session');
    if (listEl) listEl.style.display = 'none';
    if (!sessionEl) return;

    let html = `
      <div class="stats" style="text-align:center;">
        <strong>${escapeHtml(train.name)}</strong><br>
        <span style="font-size:13px;color:#88ff88;">by ${escapeHtml(train.createdByNickname || 'Unknown')}</span>
      </div>
      <p class="hint" style="text-align:center;">Fill weight (kg) and actual reps for every set, then confirm.</p>
    `;

    train.exercises.forEach((ex, exIdx) => {
      html += `
        <div class="session-exercise" data-ex-index="${exIdx}">
          <div class="session-exercise-title">${exIdx + 1}. ${escapeHtml(ex.exercise)}</div>
      `;
      for (let s = 1; s <= ex.sets; s++) {
        html += `
          <div class="session-set-row" data-set="${s}">
            <span class="session-set-label">Set ${s}</span>
            <input type="number" class="set-weight" placeholder="kg" step="0.5" min="0" data-ex="${exIdx}" data-set="${s}">
            <input type="number" class="set-reps" placeholder="reps" min="1" data-ex="${exIdx}" data-set="${s}">
            <span class="session-suggested">suggested ${ex.suggestedReps} reps</span>
          </div>
        `;
      }
      html += `</div>`;
    });

    html += `
      <div class="session-total" id="session-preview-xp"></div>
      <div class="session-actions">
        <button type="button" class="btn-secondary" onclick="cancelTrainSession()">Cancel</button>
        <button type="button" id="confirm-train-btn" onclick="confirmTrainSession()">CONFIRM TRAIN 💪</button>
      </div>
    `;

    sessionEl.innerHTML = html;
    sessionEl.style.display = 'block';

    // Live XP preview (optional nicety)
    sessionEl.querySelectorAll('.set-weight, .set-reps').forEach(inp => {
      inp.addEventListener('input', updateSessionXpPreview);
    });
  } catch (e) {
    console.error('startTrainSession error:', e);
    await showAlert('Error starting train.');
  }
}

function updateSessionXpPreview() {
  if (!currentTrainSession) return;
  const preview = document.getElementById('session-preview-xp');
  if (!preview) return;

  let total = 0;
  currentTrainSession.exercises.forEach((ex, exIdx) => {
    for (let s = 1; s <= ex.sets; s++) {
      const wEl = document.querySelector(`.set-weight[data-ex="${exIdx}"][data-set="${s}"]`);
      const rEl = document.querySelector(`.set-reps[data-ex="${exIdx}"][data-set="${s}"]`);
      const weight = wEl ? parseFloat(wEl.value) : NaN;
      const reps = rEl ? parseInt(rEl.value, 10) : NaN;
      if (!isNaN(weight) && !isNaN(reps) && reps >= 1) {
        const factor = exerciseFactors[ex.exercise] ?? 0.1;
        total += Math.floor(reps * Math.pow(weight * factor, 2));
      }
    }
  });
  preview.textContent = total > 0 ? `Estimated XP if confirmed: +${total}` : '';
}

function cancelTrainSession() {
  currentTrainSession = null;
  const sessionEl = document.getElementById('trains-session');
  if (sessionEl) {
    sessionEl.style.display = 'none';
    sessionEl.innerHTML = '';
  }
  loadTrainsList();
}

async function confirmTrainSession() {
  if (!currentUser || !currentTrainSession) return;

  const train = currentTrainSession;
  const setsToLog = []; // { exercise, weight, reps, xpGain, muscleGains }

  // Collect & validate every set
  for (let exIdx = 0; exIdx < train.exercises.length; exIdx++) {
    const ex = train.exercises[exIdx];
    for (let s = 1; s <= ex.sets; s++) {
      const wEl = document.querySelector(`.set-weight[data-ex="${exIdx}"][data-set="${s}"]`);
      const rEl = document.querySelector(`.set-reps[data-ex="${exIdx}"][data-set="${s}"]`);
      const weight = wEl ? parseFloat(wEl.value) : NaN;
      const reps = rEl ? parseInt(rEl.value, 10) : NaN;

      if (isNaN(weight) || weight < 0 || isNaN(reps) || reps < 1) {
        await showAlert(`Please fill valid weight and reps for:\n${ex.exercise} — Set ${s}`);
        return;
      }

      const factor = exerciseFactors[ex.exercise] ?? 0.1;
      const xpGain = Math.floor(reps * Math.pow(weight * factor, 2));
      const muscleMap = exerciseMuscles[ex.exercise] || {};
      const muscleGains = {};
      for (const [muscle, pct] of Object.entries(muscleMap)) {
        muscleGains[muscle] = Math.floor(xpGain * (pct / 100));
      }

      setsToLog.push({
        exercise: ex.exercise,
        weight,
        reps,
        xpGain,
        muscleGains
      });
    }
  }

  if (setsToLog.length === 0) {
    await showAlert('No sets to log.');
    return;
  }

  const totalXP = setsToLog.reduce((sum, s) => sum + s.xpGain, 0);

  // Confirm dialog
  const confirmMsg =
    `Confirm this train?\n\n` +
    `${train.name}\n` +
    `${setsToLog.length} sets\n` +
    `Total +${totalXP} XP\n\n` +
    `Click OK to save all sets, or Cancel to go back.`;
  if (!(await showConfirm(confirmMsg))) return;

  // Disable button to prevent double-submit
  const btn = document.getElementById('confirm-train-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      await showAlert('User data not found.');
      return;
    }
    const data = doc.data();

    // Aggregate XP & muscles
    let totalXpGain = 0;
    const totalMuscleGains = {};
    setsToLog.forEach(s => {
      totalXpGain += s.xpGain;
      for (const [m, g] of Object.entries(s.muscleGains)) {
        totalMuscleGains[m] = (totalMuscleGains[m] || 0) + g;
      }
    });

    let newXP = (data.xp || 0) + totalXpGain;
    let newLevel = data.level || 1;
    while (newXP >= calculateCumulativeXP(newLevel) + newLevel * 1000) {
      newLevel++;
    }

    const strengthGain = Math.floor(totalXpGain / 30);
    const newStrength = Math.floor((data.strength || 10) + strengthGain);

    // Lifetime muscles
    const updatedMuscles = { ...(data.muscles || emptyMuscles()) };
    for (const [m, g] of Object.entries(totalMuscleGains)) {
      updatedMuscles[m] = (updatedMuscles[m] || 0) + g;
    }

    // Daily / weekly
    const today = getTodayString();
    const weekStart = getWeekStartString();

    let dailyXP = data.dailyXP || 0;
    if (data.lastDailyReset !== today) dailyXP = 0;
    dailyXP += totalXpGain;

    let weeklyXP = data.weeklyXP || 0;
    let currentWeeklyMuscles = data.weeklyMuscles || emptyMuscles();
    if (data.lastWeeklyReset !== weekStart) {
      weeklyXP = 0;
      currentWeeklyMuscles = emptyMuscles();
    }
    weeklyXP += totalXpGain;

    const updatedWeeklyMuscles = { ...currentWeeklyMuscles };
    for (const [m, g] of Object.entries(totalMuscleGains)) {
      updatedWeeklyMuscles[m] = (updatedWeeklyMuscles[m] || 0) + g;
    }

    await userRef.update({
      xp: newXP,
      level: newLevel,
      strength: newStrength,
      dailyXP,
      lastDailyReset: today,
      weeklyXP,
      lastWeeklyReset: weekStart,
      muscles: updatedMuscles,
      weeklyMuscles: updatedWeeklyMuscles
    });

    // Save every set to history (with trainName)
    const setsRef = userRef.collection('sets');
    const batch = db.batch();
    const newSetRefs = [];

    setsToLog.forEach(s => {
      const ref = setsRef.doc(); // auto-id
      newSetRefs.push(ref);
      batch.set(ref, {
        exercise: s.exercise,
        weight: s.weight,
        reps: s.reps,
        xp: s.xpGain,
        trainName: train.name,
        trainId: train.id,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    // Keep only newest 30 sets
    const allSetsSnap = await setsRef.orderBy('createdAt', 'asc').get();
    if (allSetsSnap.size > 30) {
      const excess = allSetsSnap.size - 30;
      const delBatch = db.batch();
      allSetsSnap.docs.slice(0, excess).forEach(d => delBatch.delete(d.ref));
      await delBatch.commit();
    }

    // Success message
    let muscleMsg = Object.entries(totalMuscleGains)
      .filter(([, g]) => g > 0)
      .map(([m, g]) => `${m} +${g}`)
      .join(', ');

    await showAlert(
      `✅ Train completed!\n\n` +
      `${train.name}\n` +
      `+${totalXpGain} XP\n` +
      (muscleMsg ? `(${muscleMsg})` : '')
    );

    await loadUserData(currentUser.uid);
    loadLeaderboards();

    // Clear session and go back to list
    currentTrainSession = null;
    cancelTrainSession();

  } catch (e) {
    console.error('confirmTrainSession error:', e);
    await showAlert('Error saving train: ' + e.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'CONFIRM TRAIN 💪';
    }
  }
}

