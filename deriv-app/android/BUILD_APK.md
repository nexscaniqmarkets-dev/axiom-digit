# Build the Axiom Digit APK

## Prerequisites on your PC
- [Android Studio](https://developer.android.com/studio) (free)
- Java JDK 17+ (Android Studio installs this for you)
- Node.js 18+

## Steps

### 1. Update backend URL
Before building, open `capacitor.config.ts` in the root and replace:
```
url: 'https://axiom-digit-trader.onrender.com'
```
with your actual Render deployment URL.

### 2. Sync the project
In the project root folder, run:
```bash
npm run cap:sync
```

### 3. Open in Android Studio
```bash
npm run cap:open
```
This opens the `android/` folder in Android Studio automatically.

### 4. Build APK
In Android Studio:
- Wait for Gradle sync to finish (1-2 mins first time)
- Menu → **Build → Build Bundle(s) / APK(s) → Build APK(s)**
- APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. Install on phone
Connect your Android phone via USB with Developer Mode on, then:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```
OR just copy the APK file to your phone and open it to install directly.

## Note
The APK connects to your Render backend. Make sure the backend is deployed
and running before using the app.
