import { normalizeWind } from "./wind-rules.js";
import { normalizeHydraulics } from "./hydraulic-rules.js";
import { normalizeResonance } from "./resonance-rules.js";
import { normalizeThermal } from "./thermal-rules.js";
import { normalizeWeights } from "./counterweight-rules.js";
import { normalizeAlignments } from "./observatory-state.js";
import { normalizeSolar } from "./solar-rules.js";
import { normalizeBells } from "./bell-rules.js";
export const SAVE_KEY = "vesper-expedition-v1";
export const defaults = () => ({
  version: 1,
  currentLevel: 0,
  levels: {},
  settings: {
    volume: 45,
    quality: "high",
    sensitivity: 50,
    invertY: false,
    muted: false,
    music: 32,
    ambience: 80,
    effects: 75,
  },
  createdAt: Date.now(),
});
export function normalizeSave(value) {
  const base = defaults();
  if (
    !value ||
    value.version !== 1 ||
    typeof value.levels !== "object" ||
    Array.isArray(value.levels) ||
    !value.levels
  )
    return base;
  base.currentLevel = Number.isInteger(value.currentLevel)
    ? Math.max(0, Math.min(7, value.currentLevel))
    : 0;
  for (const [key, v] of Object.entries(value.levels)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (!v || typeof v !== "object") continue;
    const strings = (a) =>
      Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
    const position = (p) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.z) &&
      p.x >= 0 &&
      p.z >= 0 &&
      p.x < 427 &&
      p.z < 427
        ? {
            x: p.x,
            z: p.z,
            ...(Number.isFinite(p.height) && p.height >= 0 && p.height <= 30
              ? { height: p.height }
              : {}),
          }
        : null;
    base.levels[key] = {
      stage: Number.isFinite(v.stage)
        ? Math.max(0, Math.min(10, Math.floor(v.stage)))
        : 0,
      field: [
        ...new Set(
          strings(v.field).filter((id) => /^field-[0-9]-[0-2]$/.test(id)),
        ),
      ],
      found: [
        ...new Set(
          strings(v.found).filter((id) =>
            /^(note-(?:[0-9]|1[01])|treasure-1[2-7]|relic)$/.test(id),
          ),
        ),
      ],
      explored: [
        ...new Set(
          strings(v.explored).filter((cell) =>
            /^(?:[0-9]|[1-5][0-9]|60),(?:[0-9]|[1-5][0-9]|60)$/.test(cell),
          ),
        ),
      ],
      defeated: [
        ...new Set(
          strings(v.defeated).filter((id) =>
            /^guardian-[0-8](?:-1)?$/.test(id),
          ),
        ),
      ],
      completed: !!v.completed,
      routeVersion: Number.isInteger(v.routeVersion)
        ? Math.max(0, v.routeVersion)
        : 0,
      counterweights: normalizeWeights(key, v.counterweights),
      alignments: key === "eclipse" ? normalizeAlignments(v.alignments) : {},
      solar: key === "sands" ? normalizeSolar(v.solar) : {},
      bells: key === "frost" ? normalizeBells(v.bells) : {},
      hydraulics: key === "tides" ? normalizeHydraulics(v.hydraulics) : {},
      thermal: key === "embers" ? normalizeThermal(v.thermal) : {},
      wind: key === "sky" ? normalizeWind(v.wind) : {},
      resonance: key === "crystal" ? normalizeResonance(v.resonance) : {},
      time: Number.isFinite(v.time) ? Math.max(0, v.time) : 0,
      health: Math.max(1, Math.min(100, Number(v.health) || 100)),
      medkits: Math.max(0, Math.min(20, Number(v.medkits) || 0)),
      position: position(v.position),
      checkpoint: position(v.checkpoint),
      traversal:
        v.traversal &&
        /^field-[0-9]-[0-2]$/.test(v.traversal.id) &&
        Number.isInteger(v.traversal.ledge) &&
        v.traversal.ledge >= 0 &&
        v.traversal.ledge <= 4
          ? { id: v.traversal.id, ledge: v.traversal.ledge }
          : null,
      lastPlayed: Number(v.lastPlayed) || Date.now(),
    };
  }
  if (value.settings) {
    base.settings.volume = Math.max(
      0,
      Math.min(100, Number(value.settings.volume) || 0),
    );
    base.settings.sensitivity = Math.max(
      10,
      Math.min(100, Number(value.settings.sensitivity) || 50),
    );
    base.settings.quality = ["low", "medium", "high"].includes(
      value.settings.quality,
    )
      ? value.settings.quality
      : "high";
    base.settings.invertY = !!value.settings.invertY;
    base.settings.muted = !!value.settings.muted;
    for (const name of ["music", "ambience", "effects"])
      if (Number.isFinite(value.settings[name]))
        base.settings[name] = Math.max(0, Math.min(100, value.settings[name]));
  }
  return base;
}
export class SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.available = true;
    try {
      this.data = normalizeSave(JSON.parse(storage.getItem(SAVE_KEY)));
    } catch {
      this.data = defaults();
    }
    this.save();
  }
  save() {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }
  level(id) {
    return (this.data.levels[id] ??= {
      stage: 0,
      field: [],
      found: [],
      explored: [],
      defeated: [],
      completed: false,
      routeVersion: 0,
      counterweights: normalizeWeights(id, null),
      alignments: {},
      solar: {},
      bells: {},
      hydraulics: {},
      thermal: {},
      resonance: {},
      wind: {},
      time: 0,
      health: 100,
      medkits: 3,
      position: null,
      checkpoint: null,
      traversal: null,
      lastPlayed: Date.now(),
    });
  }
  total() {
    return Object.values(this.data.levels).reduce(
      (a, l) => ({
        completed: a.completed + Number(l.completed),
        notes: a.notes + l.found.filter((x) => x.startsWith("note")).length,
        treasures:
          a.treasures + l.found.filter((x) => x.startsWith("treasure")).length,
        time: a.time + l.time,
      }),
      { completed: 0, notes: 0, treasures: 0, time: 0 },
    );
  }
  export() {
    return JSON.stringify(this.data, null, 2);
  }
  import(text) {
    const parsed = JSON.parse(text);
    if (
      parsed?.version !== 1 ||
      !parsed.levels ||
      typeof parsed.levels !== "object" ||
      Array.isArray(parsed.levels)
    )
      throw new Error("This is not a Vesper save file.");
    this.data = normalizeSave(parsed);
    this.save();
  }
}
