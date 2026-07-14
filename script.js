// ============== CONFIG & INIT ==============
let db, auth, currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof firebase === 'undefined') {
    console.error("Firebase not loaded");
    return;
  }
  auth = firebase.auth();
  db = firebase.firestore();

  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('main-game').style.display = 'block';
      initUserData();
    } else {
      document.getElementById('auth-section').style.display = 'block';
      document.getElementById('main-game').style.display = 'none';
    }
  });

  populateExercises();
  setupAuthListeners();
  setupWorkoutListeners();
});

// ============== EXERCISES ==============
const exercises = ["Bench Press","Pull Ups","Push Ups","Deadlift","Leg Press","Leg Extension","Leg Curl","Chest Fly","Pull-down","Bent-over Row","Shoulder Press","Lateral Raise","Push-down","Lying Triceps Extension","Dip","Biceps Curl","Hammer Curl"];

function populateExercises() {
  const select = document.getElementById('exercise-select');
  exercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex;
    opt.textContent = ex;
    select.appendChild(opt);
  });
}

// ============== AUTH ==============
function setupAuthListeners() {
  const showBtn = document.getElementById('show-auth-btn');
  showBtn.addEventListener('click', () => {
    const nickname = prompt("Enter Nickname:");
    const password = prompt("Enter Password (min 4 chars):");
    if (!nickname || password.length < 4) {
      alert("Invalid nickname or password (min 4 chars)");
      return;
    }
    registerOrLogin(nickname, password);
  });
}

async function registerOrLogin(nickname, password) {
  try {
    // Try login first
    const userCred = await auth.signInWithEmailAndPassword(`${nickname}@gymgrinder.app`, password);
    checkApproval(userCred.user.uid);
  } catch (e) {
    // Register
    const userCred = await auth.createUserWithEmailAndPassword(`${nickname}@gymgrinder.app`, password);
    await db.collection('users').doc(userCred.user.uid).set({
      nickname: nickname,
      level: 1,
      xp: 0,
      strength: 10,
      approved: false,
      dailyXP: 0,
      weeklyXP: 0,
      lastReset: new Date().toISOString()
    });
    alert("Registration submitted! Waiting for admin approval.");
  }
}

async function checkApproval(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  if (userDoc.exists && userDoc.data().approved) {
    console.log("✅ Approved");
    loadUserProfile();
  } else {
    alert("Your account is pending admin approval.");
    auth.signOut();
  }
}

// ============== USER & XP ==============
async function initUserData() {
  loadUserProfile();
  loadLeaderboards();
  applyDailyReset();
}

async function loadUserProfile() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  const data = doc.data();
  if (!data) return;

  const xpToNext = data.level * 100;
  document.getElementById('stats').innerHTML = `
    Level: ${data.level} | XP: ${data.xp}/${xpToNext} | Strength: ${data.strength}
  `;
  document.getElementById('user-info').textContent = `Welcome, ${data.nickname}`;
}

function getLondonDate() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

async function applyDailyReset() {
  const userRef = db.collection('users').doc(currentUser.uid);
  const doc = await userRef.get();
  const data = doc.data();
  const today = getLondonDate();

  if (data.lastReset !== today) {
    await userRef.update({
      dailyXP: 0,
      lastReset: today
      // weekly reset logic can be added similarly with week number
    });
  }
}

// ============== WORKOUT ==============
function setupWorkoutListeners() {
  document.getElementById('confirm-btn').addEventListener('click', logWorkout);
}

async function logWorkout() {
  const exercise = document.getElementById('exercise-select').value;
  const weight = parseFloat(document.getElementById('weight').value);
  const reps = parseInt(document.getElementById('reps').value);

  if (!weight || !reps || !exercise) {
    alert("Please fill weight and reps");
    return;
  }

  const factor = 0.1; // Adjust as needed
  const xpGain = Math.floor(weight * reps * factor);

  const userRef = db.collection('users').doc(currentUser.uid);
  const doc = await userRef.get();
  let data = doc.data();

  const newXP = data.xp + xpGain;
  let newLevel = data.level;
  let xpToNext = newLevel * 100;

  while (newXP >= xpToNext) {
    newLevel++;
    xpToNext = newLevel * 100;
  }

  await userRef.update({
    xp: newXP,
    level: newLevel,
    strength: data.strength + Math.floor(xpGain / 50), // example strength gain
    dailyXP: (data.dailyXP || 0) + xpGain,
    weeklyXP: (data.weeklyXP || 0) + xpGain
  });

  document.getElementById('log-message').textContent = `+${xpGain} XP from ${exercise}!`;
  loadUserProfile();
  loadLeaderboards();
}

// ============== LEADERBOARDS ==============
async function loadLeaderboards() {
  // Global
  const globalSnap = await db.collection('users')
    .orderBy('level', 'desc')
    .limit(20)
    .get();

  let html = '<ol>';
  globalSnap.forEach(doc => {
    const d = doc.data();
    html += `<li>${d.nickname} - Level ${d.level}</li>`;
  });
  html += '</ol>';
  document.getElementById('global-lb').innerHTML = html;

  // Daily & Weekly (similar, order by dailyXP / weeklyXP)
  // Add similar queries for daily and weekly
  console.log("Leaderboards loaded");
}
