/** Opening intro preferences. Plain module so the server layout can inline the boot script. */
/** Set once per app launch (sessionStorage) so the intro plays when the app opens, not on reloads. */
export const INTRO_SEEN_KEY = "flowed.intro.seen";
/** "off" disables the intro (Settings → Appearance). Small per-device UI preference. */
export const INTRO_PREF_KEY = "flowed.intro";

/** Runs in <head> before first paint so a reload in the same session never flashes the intro. */
export const introBootScript = `try{if(sessionStorage.getItem("${INTRO_SEEN_KEY}")||localStorage.getItem("${INTRO_PREF_KEY}")==="off")document.documentElement.dataset.intro="skip"}catch(e){}`;
