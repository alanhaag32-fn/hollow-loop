// The game holds still while any full-screen card (the intro, the welcome-back card) is up.
const holds = new Set();
export const hold = (why, on) => { if (on) holds.add(why); else holds.delete(why); };
export const paused = () => holds.size > 0;
