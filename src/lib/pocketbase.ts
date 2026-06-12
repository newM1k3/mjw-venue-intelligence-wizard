import PocketBase from 'pocketbase';

// Single shared PocketBase client. Base URL comes from VITE_POCKETBASE_URL
// (see .env.example). Matches the dashboard's client setup.
export const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);

pb.autoCancellation(false);

export default pb;
