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
      setupWorkoutListeners();           // ← Added here
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
      alert("Login successful!");
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        userCred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(userCred.user.uid).set({
          nickname: nickname,
          level: 1,
          xp: 0,
          strength: 10,
          approved: false,
          dailyXP: 0,
          weeklyXP: 0
        });
        alert("Account created! Ask admin to approve it in Firestore.");
      } else {
        alert("Error: " + e.message);
      }
    }
  } catch (error) {
    alert("Something went wrong: " + error.message);
  }
}

async function loadUserData(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.exists) {
    const data = doc.data();
    if (!data.approved) {
      alert("Account not approved yet.");
      auth.signOut();
      return;
    }
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

  if (!weight || !reps) {
    alert("Please enter weight and reps!");
    return;
  }

  const factor = 0.1;
  const xpGain = Math.floor(weight * reps * factor);

  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    const data = doc.data();

    let newXP = data.xp + xpGain;
    let newLevel = data.level;

    while (newXP >= newLevel * 100) {
      newLevel++;
    }

    await userRef.update({
      xp: newXP,
      level: newLevel,
      strength: Math.floor(data.strength + (xpGain / 30)),
      dailyXP: (data.dailyXP || 0) + xpGain
    });

    document.getElementById('log-message').innerHTML = 
      `✅ +${xpGain} XP from ${exercise}!`;

    await loadUserData(currentUser.uid);

  } catch (error) {
    console.error(error);
    alert("Error saving workout.");
  }
}
