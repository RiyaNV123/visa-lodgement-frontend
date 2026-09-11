# 485 Visa Lodgement Calculator — Frontend

React (Vite) frontend for the 485 Visa Lodgement Date Calculator — the
student and admin portal for document collection and eligibility results.

Split out from the original combined `485-visa-lodgement-calculator` repo
into its own repo — this half is the frontend only. The backend lives in a
separate repo: `485-visa-lodgement-backend`.

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and point `VITE_API_BASE_URL` at your running
backend.

## What's here

- `src/pages/` — the student flow (case creation, document upload, results)
  and the admin dashboard/case review views.
- `src/components/` — shared UI (`AppShell`, `DocUploadSlot`, `Spinner`).
- `src/context/AuthContext.jsx` — auth/session state.
