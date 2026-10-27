# GymBro

A mobile fitness companion for planning workouts, tracking training and meals, and chatting with an AI coach. GymBro combines an Expo app with an Express API and Firebase, keeping AI provider credentials on the server.

## Features

- **Personalized training:** build a workout plan from your profile and schedule, log sets, reps, weight, and timed exercises, and use an in-session rest timer.
- **Nutrition:** generate a meal plan, log planned meals, estimate nutrition from a description, and explore recipes and meal alternatives.
- **AI coach:** ask questions in a conversational interface, with optional voice transcription.
- **Progress and preferences:** view workout history and progress, manage your profile, and choose your preferred theme and weight unit.

The API also exposes recovery scoring and exercise substitution endpoints; these are not currently connected to controls in the mobile app.

## Technology

- **Mobile:** Expo SDK 58, React Native, Expo Router, Zustand, and Firebase JS SDK
- **API:** Node.js, Express, Firebase Admin SDK, Zod, and Jest
- **Services:** Firebase Authentication and Cloud Firestore; Gemini or OpenRouter for AI; Groq for audio transcription

## Project structure

```text
.
├── gymbro-app/            Expo application
│   ├── app/               File-based routes and screens
│   ├── components/        UI components grouped by feature
│   ├── hooks/             Shared React hooks
│   ├── services/          Firebase, API, and application services
│   └── store/             Zustand state stores
├── gymbro-backend/        Express API
│   ├── controllers/       Request handlers
│   ├── middleware/        Authentication, throttling, and validation
│   ├── prompts/           AI prompt templates
│   ├── routes/            API routes
│   ├── schemas/           Zod request schemas
│   ├── services/          AI providers and supporting services
│   ├── __tests__/         Jest and Supertest tests
│   └── firestore.rules    Firestore security rules
└── docs/                  Five phases of the project specification
```

## Getting started

### Prerequisites

- Node.js **22.13 or later on the 22.x line**, 24.3 or later on the 24.x line, or 26 and later. The backend alone supports Node.js 20 and later.
- A Firebase project with Email/Password Authentication and Cloud Firestore enabled.
- Firebase web app configuration and a Firebase Admin service account for the same project.
- An API key for the AI provider you intend to use. A Groq key is needed for voice transcription.
- An SDK 58-compatible Expo Go installation, or an appropriately configured simulator or development build.

### 1. Configure and start the API

```bash
cd gymbro-backend
npm install
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` in place of `cp` if preferred.

Fill in `.env` with the Firebase service-account values and the selected provider's key. `AI_PROVIDER` defaults to `gemini`; set it to `openrouter` and provide the OpenRouter settings if using that provider. Keep the private key's newline characters escaped as `\n`, as shown in the template. Add `GROQ_API_KEY` to enable transcription.

```bash
npm run dev
```

The API listens on port `3000` by default. Check it with:

```bash
curl http://localhost:3000/health
```

Deploy the checked-in Firestore rules to your intended Firebase project using the Firebase CLI:

```bash
# From gymbro-backend/, after installing and signing in to the Firebase CLI
firebase use --add
npm run predeploy
```

### 2. Configure and start the app

In a second terminal:

```bash
cd gymbro-app
npm install --legacy-peer-deps
cp .env.example .env.local
```

Fill in `.env.local` with your Firebase web configuration and `EXPO_PUBLIC_API_BASE_URL`, then start Expo:

```bash
npx expo start --clear --lan
```

Open the app in a compatible Expo Go client or simulator. For a physical phone, set `EXPO_PUBLIC_API_BASE_URL` to your computer's reachable LAN address and API port, for example `http://192.168.1.20:3000`. The phone must be able to reach that address; Expo's tunnel does not expose the Express API. Emulator networking varies by platform, so use an address reachable from your emulator rather than assuming `localhost` points to your computer.

### Environment and security

The `.env.example` files document the supported settings. The app's `EXPO_PUBLIC_*` values are included in its bundle; Firebase web configuration is client configuration, and access is controlled by Firebase Authentication and Firestore rules. Keep AI provider keys and Firebase service-account credentials in the backend environment only. Never commit populated environment files.

## Architecture

The app uses Firebase Authentication to identify users and accesses user-scoped Firestore documents for profiles, plans, logs, and conversations. AI requests go to the Express API with a Firebase ID token. The backend verifies the token, validates requests, and calls the configured provider through a shared resilience layer. Audio transcription is also proxied through the API.

On native devices, the Firebase JS SDK uses an in-memory Firestore cache. Cached data and queued writes do not persist across app restarts. Workout sessions are held in memory until saved; saving requires a successful Firestore transaction.

## API overview

`GET /health` is unauthenticated. The following endpoints require a Firebase ID token:

- `POST /api/ai/generate-plan` and `/api/ai/generate-meal-plan`
- `POST /api/ai/estimate-nutrition`, `/api/ai/meal-detail`, and `/api/ai/substitute-meal`
- `POST /api/ai/chat`, `/api/ai/recovery-score`, and `/api/ai/substitute-exercise`
- `POST /api/audio/transcribe` — multipart upload using the `audio` field

Request schemas live in [`gymbro-backend/schemas/`](gymbro-backend/schemas/). Provider selection is configuration-based; it does not automatically switch providers on failure.

## Checks

Run these commands from their respective package directories:

```bash
# gymbro-backend/
npm run lint
npm test -- --ci --runInBand

# gymbro-app/
npm run lint
npm run typecheck
npx expo-doctor
npx expo export --platform ios --platform android
```

Backend tests mock external AI providers. The app's typecheck uses its existing TypeScript configuration and is not a substitute for testing JavaScript behavior. Manually verify affected screens on a device or simulator when making UI changes.

## Documentation

The project specifications are in [`docs/`](docs/):

1. [Architecture and data model](docs/GymBro_SRS_Phase_1.md)
2. [AI features and contracts](docs/GymBro_SRS_Phase_2.md)
3. [Mobile application](docs/GymBro_SRS_Phase_3.md)
4. [Backend implementation](docs/GymBro_SRS_Phase_4.md)
5. [Operational considerations](docs/GymBro_SRS_Phase_5.md)

The SRS describes intended behavior; consult the implementation when checking current behavior. No EAS build configuration is checked in, so configure EAS before producing an APK or other EAS build.
