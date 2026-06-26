// ESM entry — Node's CJS interop hands back the UMD module.exports as default.
import GL from "./src/growth-loop.js";
export const { configure, Daily, Streak, ShareCard, LoopTrack, VERSION } = GL;
export default GL;
