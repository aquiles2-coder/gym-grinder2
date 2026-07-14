let db, auth;

document.addEventListener('DOMContentLoaded', () => {
  auth = firebase.auth();
  db = firebase.firestore();

  document.getElementById('show-auth-btn').addEventListener('click', async () => {
    const nickname = prompt("Nickname:");
    const password = prompt("Password:");

    if (!nickname || password.length < 4) return alert("Invalid input");

    const email = `${nickname.toLowerCase()}@gymgrinder.app`;

    try {
      let userCred;
      try {
        userCred = await auth.signInWithEmailAndPassword(email, password);
      } catch (e) {
        userCred = await auth.createUserWithEmailAndPassword(email, password);
      }

      // Create user document
      await db.collection('users').doc(userCred.user.uid).set({
        nickname: nickname,
        level: 1,
        xp: 0,
        approved: false
      }, { merge: true });

      alert("User document created! Check Firestore now.");
      console.log("User UID:", userCred.user.uid);
    } catch (error) {
      alert("Error: " + error.message);
      console.error(error);
    }
  });
});
