// Side-effect module: import this FIRST in main.jsx. ES imports evaluate in
// order, so the storage shim is in place before any other module loads.
import { installSafeStorage } from "./safeStorage.js";

installSafeStorage();
