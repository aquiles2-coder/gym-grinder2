# 🏋️ Gym Grinder

A gamified workout tracker. Log work out sets and cardio, gain XP, level up, track muscle progress, create shared “Trains”, and compete on leaderboards.

---

## Features

- **Strength logging** – Exercise + weight + reps → XP
- **Cardio logging** – Exercise + Distance (km) → XP
- **Level & Strength system** – XP increases your level and Strength stat
- **Muscle progress** – Every exercise distributes XP to the muscles it works (Chest, Back, Shoulders, Biceps, Triceps, Forearms, Core, Quads, Hamstrings, Glutes, Calves + Cardio)
- **Personalized Trains** – Create up to 6 shared workout templates (min 3 exercises). Anyone can use them.
- **History** – Last 30 confirmed sets
- **Week Progress** – Weekly XP per muscle (resets every Monday)
- **Leaderboards** – Global / Daily / Weekly
- **Account approval** – New accounts start locked until the admin approves them in Firebase

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript
- Firebase Authentication
- Cloud Firestore

---

## How to run locally

1. Clone the repo
2. Open `index.html` in a browser\
   (or use any static server, e.g. Live Server / `npx serve`)

> The app talks directly to Firebase, so no backend server is needed.

---

## Firebase Setup (for developers)

1. Create a Firebase project
2. Enable **Authentication → Email/Password**
3. Create a Firestore database
4. Paste your config into `firebase-config.js`
5. Deploy the rules from `firestore.rules` (or the file `fire base rules.txt`)

### Important rules behaviour

- New users are created with `approved: false`
- Only the admin can change the `approved` field
- Max 6 trains per player is enforced with a `trainCount` counter
- Leaderboard documents only contain public data (nickname, level, XP…)

---

## XP Formula (simplified)

**Strength exercises**\
`XP = floor( reps × (weight × factor)² )`

**Cardio**\
`XP = floor( coefficient × kilometers × 20000 )`

Each exercise also distributes a percentage of the XP to the muscles it works.

---

## Account Approval

When someone registers they see a “Waiting for Approval” screen.\
To approve them:

1. Go to Firebase Console → Firestore → `users` collection
2. Find the user document
3. Set the field `approved` to `true`

---

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.
