import { normalizeRainGarden } from "./rain-garden-rules.js";
import { normalizeEasternReflector } from "./eastern-reflector-rules.js";
import { normalizeCoralPump } from "./coral-pump-rules.js";
import { normalizeFrozenStair } from "./frozen-stair-rules.js";
import { normalizeCourier } from "./courier-rules.js";
import { normalizeCleft } from "./cleft-rules.js";
import { normalizePressure } from "./pressure-rules.js";
import { normalizeEcho } from "./echo-gallery-rules.js";
import { normalizeOrbit } from "./orbit-rules.js";
import { normalizeBellHoist } from "./bell-hoist-rules.js";
import { normalizeWind } from "./wind-rules.js";
import { normalizeCipher } from "./cipher-rules.js";
import { normalizeHydraulics } from "./hydraulic-rules.js";
import { normalizeResonance } from "./resonance-rules.js";
import { normalizeThermal } from "./thermal-rules.js";
import { normalizeWeights } from "./counterweight-rules.js";
import { normalizeAlignments } from "./observatory-state.js";
import { normalizeSolar } from "./solar-rules.js";
import { normalizeBells } from "./bell-rules.js";
import { normalizeGallery } from "./sunken-gallery-record.js";
import { normalizeFireVault } from "./fire-vault-rules.js";
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
  if (Number.isFinite(value.createdAt) && value.createdAt > 0)
    base.createdAt = value.createdAt;
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
      cipher: key === "verdant" ? normalizeCipher(v.cipher) : {},
      alignments: key === "eclipse" ? normalizeAlignments(v.alignments) : {},
      solar: key === "sands" ? normalizeSolar(v.solar) : {},
      bells: key === "frost" ? normalizeBells(v.bells) : {},
      hydraulics: key === "tides" ? normalizeHydraulics(v.hydraulics) : {},
      thermal: key === "embers" ? normalizeThermal(v.thermal) : {},
      wind: key === "sky" ? normalizeWind(v.wind) : {},
      resonance: key === "crystal" ? normalizeResonance(v.resonance) : {},
      archive:
        key === "tides"
          ? [
              ...new Set(
                strings(v.archive).filter((id) => /^tide-[0-4]$/.test(id)),
              ),
            ]
          : [],
      gallery: key === "tides" ? normalizeGallery(v.gallery) : null,
      coralPump:
        key === "tides"
          ? normalizeCoralPump(v.coralPump, {
              stage: Number.isFinite(v.stage) ? Math.floor(v.stage) : 0,
              field: strings(v.field),
            })
          : null,
      fireVault: key === "verdant" ? normalizeFireVault(v.fireVault) : null,
      bellHoist: key === "frost" ? normalizeBellHoist(v.bellHoist) : null,
      frozenStair:
        key === "frost"
          ? normalizeFrozenStair(v.frozenStair, {
              stage: Number.isFinite(v.stage) ? Math.floor(v.stage) : 0,
              field: strings(v.field),
            })
          : null,
      rainGarden:
        key === "verdant"
          ? normalizeRainGarden(v.rainGarden, {
              stage: Number.isFinite(v.stage) ? Math.floor(v.stage) : 0,
              field: strings(v.field),
            })
          : null,
      easternReflector:
        key === "sands"
          ? normalizeEasternReflector(v.easternReflector, {
              stage: Number.isFinite(v.stage) ? Math.floor(v.stage) : 0,
              field: strings(v.field),
            })
          : null,
      cleft: key === "sands" ? normalizeCleft(v.cleft) : null,
      pressureRelay:
        key === "embers" ? normalizePressure(v.pressureRelay) : null,
      echoGallery: key === "crystal" ? normalizeEcho(v.echoGallery) : null,
      orbitVault: key === "eclipse" ? normalizeOrbit(v.orbitVault) : null,
      courierFerry: key === "sky" ? normalizeCourier(v.courierFerry) : null,
      torch: key === "verdant" && v.torch === true,
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
    // Keep the live object and written save consistent when chapter progress
    // already implies a restored pump, including imported/older progress.
    const coastal = this.data.levels.tides;
    if (coastal)
      Object.assign(
        (coastal.coralPump ??= {}),
        normalizeCoralPump(coastal.coralPump, coastal),
      );
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
      cipher: {},
      alignments: {},
      solar: {},
      bells: {},
      hydraulics: {},
      thermal: {},
      resonance: {},
      wind: {},
      archive: [],
      gallery: id === "tides" ? normalizeGallery(null) : null,
      fireVault: id === "verdant" ? normalizeFireVault(null) : null,
      bellHoist: id === "frost" ? normalizeBellHoist(null) : null,
      frozenStair: id === "frost" ? { restored: false } : null,
      coralPump:
        id === "tides" ? { installed: false, intake: 0, bypass: 3 } : null,
      rainGarden:
        id === "verdant"
          ? normalizeRainGarden(null, { stage: 0, field: [] })
          : null,
      easternReflector: id === "sands" ? { raised: false } : null,
      cleft: id === "sands" ? normalizeCleft(null) : null,
      pressureRelay: id === "embers" ? normalizePressure(null) : null,
      echoGallery: id === "crystal" ? normalizeEcho(null) : null,
      orbitVault: id === "eclipse" ? normalizeOrbit(null) : null,
      courierFerry: id === "sky" ? normalizeCourier(null) : null,
      torch: false,
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
