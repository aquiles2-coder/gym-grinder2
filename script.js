let db, auth, currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  auth = firebase.auth();
  db = firebase.firestore();

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
      document.getElementById('auth-section').style.display = 'none';
      document.getElementById('main-game').style.display = 'block';
      await checkApproval(user.uid);
    } else {
      document.getElementById('auth-section').style.display = 'block';
      document.getElementById('main-game').style.display = 'none';
    }
  });

  populateExercises();
  setupAuthListeners();
  setupWorkoutListeners();
});

// Populate exercises
const exercises = ["Bench Press","Pull Ups","Push Ups","Deadlift","Leg Press","Leg Extension","Leg Curl","Chest Fly","Pull-down","Bent-over Row","Shoulder Press","Lateral Raise","Push-down","Lying Triceps Extension","Dip","Biceps Curl","Hammer curl"];

function populateExercises() {
  const select = document.getElementById('exercise-select');
  exercises.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex;
    opt.textContent = ex;
    select.appendChild(opt);
  });
}

// Auth
function setupAuthListeners() {
  document.getElementById('show-auth-btn').addEventListener('click', () => {
    const nickname = prompt("Enter your Nickname:");
    const password = prompt("Enter Password (minimum 4 characters):");

    if (!nickname || password.length < 4) {
      alert("Nickname and password (min 4 chars) are required!");
      return;
    }

    registerOrLogin(nickname, password);
  });
}

async function registerOrLogin(nickname, password) {
  const email = `${nickname.toLowerCase()}@gymgrinder.app`;

  try {
    // Try to login first
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    console.log("Login successful");
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      // Register new user
      const userCred = await auth.createUserWithEmailAndPassword(email, password);
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
      alert("Account created! Waiting for admin (you) to approve.");
    } else {
      alert("Error: " + error.message);
    }
  }
}

async function checkApproval(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  const data = userDoc.data();

  if (data && data.approved) {
    loadUserProfile();
    loadLeaderboards();
  } else {
    alert("Your account is not approved yet. Ask the admin to approve it.");
    auth.signOut();
  }
}

// Rest of the functions (workout, leaderboards, etc.) will be added next

function loadUserProfile() { console.log("Profile loaded"); }
function loadLeaderboards() { console.log("Leaderboards loaded"); }
function setupWorkoutListeners() {
  console.log("Workout listeners ready");
}
