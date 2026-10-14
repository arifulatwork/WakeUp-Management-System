// FEATURE SWITCHES
//
// Photos & videos (apartment cover photo / walkthrough video, before/after photos on
// cleaning jobs, photos on maintenance issues) are built but switched OFF for now.
// Reason: they need a proper file store (your own Ubuntu / Raspberry Pi server, or S3 /
// R2 / Supabase). Until that exists, everything photo-related is hidden in the screens
// and refused by the server.
//
// To turn it ON later, set this in your .env file and rebuild/restart the app:
//     NEXT_PUBLIC_MEDIA_ENABLED=true
//
// NEXT_PUBLIC_ means the value is baked into the app at build time, so after changing it
// run `npm run build` again (or restart `npm run dev`).
export const MEDIA_ENABLED = process.env.NEXT_PUBLIC_MEDIA_ENABLED === "true";
