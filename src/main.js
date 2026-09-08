import { TIDE_ARCHIVE } from "./tide-archive-records.js";
import { HOIST_RECORD } from "./bell-hoist-rules.js";
import { drawBellHoistMap } from "./bell-hoist-map.js";
import { GALLERY_RECORD } from "./sunken-gallery-record.js";
import { VAULT_RECORD } from "./fire-vault-rules.js";
import { drawFireVaultMap } from "./fire-vault-map.js";
import { drawGalleryMap } from "./sunken-gallery-map.js";
import { WIND_TRIALS, windName } from "./wind-rules.js";
import { HYDRAULIC_TRIALS } from "./hydraulic-rules.js";
import { RESONANCE_TRIALS, resonanceClue } from "./resonance-rules.js";
import { CIPHER_TRIALS, cipherClue, cipherName } from "./cipher-rules.js";
import { THERMAL_TRIALS } from "./thermal-rules.js";
import {
  createIcons,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Settings2,
  Check,
  Compass,
  BookOpen,
  Gem,
  Clock3,
  MapPin,
  Mountain,
  Play,
  X,
  MoveUpRight,
  Maximize,
  Pause,
  RotateCcw,
  Download,
  Upload,
  ShieldCheck,
  Crosshair,
  Leaf,
  Droplets,
  Flame,
  Wind,
  Snowflake,
  Sun,
  Eye,
  HelpCircle,
  Heart,
  Plus,
  Flag,
  Keyboard,
  Mouse,
  CircleCheck,
  Footprints,
} from "lucide";
import { LEVELS, SYMBOLS } from "./campaign.js";
import { readNote } from "./journal.js";
import { SaveStore } from "./storage.js";
import { Soundscape } from "./audio.js";
import {
  prepareChapter,
  preserveChapterSave,
  waitForTask,
} from "./chapter-startup.js";
import {
  mountPuzzle,
  PUZZLE_TYPES,
  PUZZLE_TITLES,
  restorePuzzle,
  createPuzzle,
  isSolved,
} from "./puzzles.js";
import { BELL_LESSONS } from "./bell-rules.js";
import "./fonts.css";
import "./style.css";
const ICONS = {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Settings2,
  Check,
  Compass,
  BookOpen,
  Gem,
  Clock3,
  MapPin,
  Mountain,
  Play,
  X,
  MoveUpRight,
  Maximize,
  Pause,
  RotateCcw,
  Download,
  Upload,
  ShieldCheck,
  Crosshair,
  Leaf,
  Droplets,
  Flame,
  Wind,
  Snowflake,
  Sun,
  Eye,
  HelpCircle,
  Heart,
  Plus,
  Flag,
  Keyboard,
  Mouse,
  CircleCheck,
  Footprints,
};
const icon = (name, cls = "") =>
  `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}" class="${cls}"></i>`;
const icons = () =>
  createIcons({ icons: ICONS, attrs: { "stroke-width": 1.5 } });
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("Storage unavailable");
    },
  };
}
const store = new SaveStore(storage),
  audio = new Soundscape();
audio.setVolume(store.data.settings.muted ? 0 : store.data.settings.volume);
audio.setMix(store.data.settings);
let selected = store.data.currentLevel,
  game = null,
  inGame = false,
  currentModal = null,
  toastTimer,
  muted = store.data.settings.muted,
  returnModal = null;
let mountedPuzzle = null;
let startup = null;
let clearTouchControls = () => {};
const formatTime = (t) =>
  `${Math.floor(t / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((t % 3600) / 60)
    .toString()
    .padStart(2, "0")}`;
const number = (n) => String(n).padStart(2, "0");
const sigil = `<svg class="sigil" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M8 11h7l9 24 9-24h7L24 43 8 11Z" stroke="currentColor" stroke-width="1.4"/><path d="m24 4 5 8-5 8-5-8 5-8Z" fill="currentColor"/><path d="M5 23h7m24 0h7M24 38v8" stroke="currentColor"/></svg>`;

function init() {
  document.querySelector("#app").innerHTML = `
    <main id="launcher">
      <div class="hero-art" id="hero-art"></div><div class="hero-shade"></div><div class="film-grain"></div>
      <header class="topbar"><a class="brand" href="#" aria-label="Vesper home">${sigil}<span>VESPER</span></a>
        <nav aria-label="Main navigation"><button class="nav-link active" data-nav="expedition">Expedition<span></span></button><button class="nav-link" data-nav="journal">Journal <span class="nav-count" id="journal-count"></span></button><button class="nav-link" data-nav="collection">Collection</button></nav>
        <div class="header-tools"><span class="save-indicator"><span class="status-dot"></span><span id="save-status">${store.available ? "LOCAL SAVE ACTIVE" : "SAVING UNAVAILABLE"}</span></span><span class="tool-divider"></span><button class="icon-button" id="sound-toggle" aria-label="Toggle sound">${icon(muted ? "VolumeX" : "Volume2")}</button><button class="icon-button" id="settings-button" aria-label="Open settings">${icon("Settings2")}</button></div>
      </header>
      <section class="hero-content" aria-labelledby="game-title"><div class="eyebrow"><span class="small-line"></span> SOME THINGS WERE NEVER MEANT TO BE FOUND</div><h1 id="game-title">VESPER</h1><div class="game-subtitle"><span></span>THE HOLLOW EARTH<span></span></div><p class="hero-description">The world has forgotten its secrets.<br>It’s time you unearthed them.</p>
      <div class="hero-actions"><button class="primary-button" id="begin-button"><span>${store.data.levels[LEVELS[selected].id]?.position ? "Continue expedition" : "Begin expedition"}</span>${icon("ArrowUpRight")}</button><button class="text-button" id="guide-button">${icon("Compass")}<span>Field guide</span></button></div>
      <div class="hero-details"><span>${icon("Mountain")}8 unique chapters</span><span class="detail-dot">·</span><span>${icon("Compass")}A world to discover</span><span class="detail-dot">·</span><span>Single player</span></div></section>
      <div class="scene-caption"><span class="caption-cross">+</span><div><span id="scene-location">CAMBODIA</span><p id="scene-caption">Where the story begins.</p></div><span class="vertical-line"></span></div>
      <section class="chapters" aria-label="Expedition chapters"><div class="section-heading"><div><span class="eyebrow">YOUR EXPEDITION</span><h2>Eight places. One extraordinary journey.</h2></div><div class="chapter-controls"><span><b id="chapter-current">01</b><span class="faint"> / 08</span></span><button class="icon-button bordered" id="previous-chapter" aria-label="Previous chapters">${icon("ChevronLeft")}</button><button class="icon-button bordered" id="next-chapter" aria-label="Next chapters">${icon("ChevronRight")}</button></div></div><div class="chapter-track" id="chapter-track">${LEVELS.map((l, i) => chapterCard(l, i)).join("")}</div></section>
      <footer><span class="footer-note">${icon("ShieldCheck")}Your progress stays with you. Automatically saved in this browser.</span><span class="footer-right"><span class="status-dot"></span> READY TO EXPLORE<span class="footer-version">V.1.0</span></span></footer>
    </main>
    <section id="game-screen" class="hidden" aria-label="Vesper adventure"><div id="game-canvas"></div><div class="game-vignette"></div><div id="damage-flash"></div>
      <div class="hud-top"><div class="hud-chapter"><span id="hud-chapter-number" class="eyebrow"></span><h2 id="hud-title"></h2><div class="hud-location" id="hud-location"></div></div><div class="hud-compass"><span>W</span><span>·</span><span id="heading">N</span><span>·</span><span>E</span><div class="compass-pointer">◇</div></div><div class="hud-top-actions"><span id="game-saved">${icon("Check")} Saved</span><button class="icon-button glass" id="map-button" aria-label="Open map">${icon("Compass")}</button><button class="icon-button glass" id="pause-button" aria-label="Pause game">${icon("Pause")}</button></div></div>
      <div class="hud-objective"><div class="objective-diamond">◇</div><div><span class="eyebrow">CURRENT OBJECTIVE <span id="objective-progress"></span></span><p id="objective-text"></p><small id="objective-detail"></small><span id="objective-distance"></span></div></div>
      <div class="crosshair" aria-hidden="true"><span></span><span></span><i></i></div><div id="aim-status" class="aim-status" role="status"></div><div id="stealth-status" class="stealth-status hidden"><span class="stealth-bearing" aria-hidden="true">↑</span><span id="stealth-label" role="status"></span><div class="stealth-track" role="meter" aria-label="Guardian suspicion" aria-valuemin="0" aria-valuemax="100"><i></i></div></div><div class="sense-label hidden" id="sense-label">${icon("Eye")} EXPLORER’S INSTINCT</div><div id="waypoint" class="waypoint">◇<span></span></div>
      <div class="interaction-prompt hidden" id="interaction-prompt"><kbd>E</kbd><span></span></div>
      <div class="hud-bottom"><div class="vitals"><div class="vital-label">${icon("Heart")}<span>VESPER VALE</span><span id="health-value">100</span></div><div class="health-track"><div id="health-bar"></div></div><div class="stamina-track"><div id="stamina-bar"></div></div><div id="dive-vitals" class="hidden"><div class="dive-air-label"><span>AIR</span><span id="dive-air-value">32 s</span></div><div class="dive-air-track" role="meter" aria-label="Breath remaining" aria-valuemin="0" aria-valuemax="32"><div id="dive-air-bar"></div></div></div><div id="torch-status" class="small-copy hidden" role="status"></div><div class="supplies"><kbd>H</kbd>${icon("Plus")}<span id="medkit-count">3</span><span class="hud-divider"></span>${icon("Gem")}<span id="treasure-count">0 / 6</span></div></div><div class="hud-controls"><span><kbd>W A S D</kbd> Move</span><span><kbd>SPACE</kbd> Jump / climb</span><span><kbd>E</kbd> Interact</span><span><kbd>F</kbd> Fire</span><span><kbd>R</kbd> Dodge</span><span><kbd>Q</kbd> Instinct</span><span><kbd>M</kbd> Map</span></div><div class="minimap-wrap"><canvas id="minimap" width="170" height="170"></canvas><span>N</span></div></div>
      <div class="touch-controls"><div class="touch-pad"><button data-touch="up" aria-label="Move forward">↑</button><button data-touch="left" aria-label="Move left">←</button><button data-touch="down" aria-label="Move backward">↓</button><button data-touch="right" aria-label="Move right">→</button></div><div class="touch-actions"><button data-touch="turn-left" aria-label="Turn camera left">↶</button><button data-touch="turn-right" aria-label="Turn camera right">↷</button><button data-touch="jump">Jump</button><button data-touch="interact">Use</button><button data-touch="aim" aria-pressed="false">Aim</button><button data-touch="fire">Fire</button><button data-touch="dodge">Dodge</button><button data-touch="crouch" aria-pressed="false">Crouch</button><button data-touch="torch" class="hidden">Torch</button><button data-touch="dive" class="hidden" aria-label="Dive down">Dive</button></div></div>
    </section>
    <div id="modal-root"></div><div class="toast hidden" id="toast" role="status"></div><div class="loading-screen hidden" id="loading" role="dialog" aria-modal="true" aria-labelledby="loading-title"><div class="loading-brand">${sigil}<span>VESPER</span></div><span class="eyebrow">ENTERING THE UNKNOWN</span><h2 id="loading-title"></h2><div class="loading-line" aria-hidden="true"><span></span></div><div id="loading-status" role="status" aria-live="polite">Preparing your expedition…</div><p>“Take the time to look. The way forward is rarely<br>the only thing worth finding.”</p><button class="text-button" id="cancel-loading">Back to expeditions</button></div>`;
  icons();
  bind();
  selectChapter(selected, false);
  updateProgress();
}
function chapterCard(l, i) {
  const p = store.data.levels[l.id];
  return `<button class="chapter-card ${selected === i ? "selected" : ""}" data-chapter="${i}" aria-label="Select chapter ${i + 1}: ${l.title}" aria-pressed="${selected === i}"><div class="chapter-image atlas-${i}"><span class="chapter-number">CHAPTER ${number(i + 1)}</span><span class="chapter-state">${p?.completed ? icon("Check") : i === selected ? '<span class="tiny-dot"></span> SELECTED' : icon("ArrowUpRight")}</span><div class="card-image-shade"></div></div><div class="chapter-info"><div class="chapter-location">${l.location}</div><h3>${l.title}</h3><div class="chapter-meta"><span>${p?.completed ? "EXPEDITION COMPLETE" : p?.position ? "EXPEDITION IN PROGRESS" : l.type.split(" · ")[0].toUpperCase()}</span><span>${p?.stage ? `${p.stage}/${l.mechanisms}` : number(i + 1)} ${icon("ArrowRight")}</span></div></div><div class="card-active-line"></div></button>`;
}
function bind() {
  document.querySelector(".brand").onclick = (e) => {
    e.preventDefault();
    closeModal();
  };
  document.querySelectorAll("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.nav === "expedition") {
          closeModal();
          document
            .querySelector(".chapters")
            .scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else if (b.dataset.nav === "journal") showJournal();
        else showCollection();
      }),
  );
  document
    .querySelectorAll("[data-chapter]")
    .forEach(
      (b) => (b.onclick = () => selectChapter(Number(b.dataset.chapter))),
    );
  document.querySelector("#begin-button").onclick = () => startGame(selected);
  document.querySelector("#guide-button").onclick = () => showGuide();
  document.querySelector("#settings-button").onclick = () => showSettings();
  document.querySelector("#sound-toggle").onclick = () => {
    muted = !muted;
    store.data.settings.muted = muted;
    store.save();
    audio.setVolume(muted ? 0 : store.data.settings.volume);
    document.querySelector("#sound-toggle").innerHTML = icon(
      muted ? "VolumeX" : "Volume2",
    );
    icons();
    toast(muted ? "Sound muted" : "Sound enabled");
  };
  document.querySelector("#previous-chapter").onclick = () => {
    selectChapter(Math.max(0, selected - 1));
    document.querySelector(`[data-chapter="${selected}"]`).scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  };
  document.querySelector("#next-chapter").onclick = () => {
    selectChapter(Math.min(7, selected + 1));
    document.querySelector(`[data-chapter="${selected}"]`).scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  };
  document.querySelector("#pause-button").onclick = () => showPause();
  document.querySelector("#map-button").onclick = () => showMap();
  window.addEventListener("keydown", (e) => {
    if (startup) {
      if (e.code === "Escape") cancelStartup();
      return;
    }
    if (!inGame && e.code === "Escape") closeModal();
  });
  window.addEventListener("beforeunload", () => game?.save());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && inGame && !game?.paused) showPause();
  });
  const heldTouchControls = new Map();
  clearTouchControls = () => {
    heldTouchControls.clear();
    if (game) {
      game.keys.clear();
      game.touchMove = { x: 0, z: 0 };
    }
  };
  document.querySelector("#cancel-loading").onclick = () => cancelStartup();
  const updateTouchControls = () => {
    if (!game) return;
    const held = [...heldTouchControls.values()];
    game.touchMove.x =
      Number(held.includes("right")) - Number(held.includes("left"));
    game.touchMove.z =
      Number(held.includes("down")) - Number(held.includes("up"));
    for (const [control, key] of [
      ["turn-left", "KeyZ"],
      ["turn-right", "KeyC"],
      ["interact", "KeyE"],
      ["dive", "KeyX"],
    ]) {
      if (held.includes(control)) game.keys.add(key);
      else game.keys.delete(key);
    }
  };
  window.addEventListener("blur", () => {
    heldTouchControls.clear();
    updateTouchControls();
  });
  document.querySelectorAll("[data-touch]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      if (!game || game.paused) return;
      const k = b.dataset.touch;
      heldTouchControls.set(e.pointerId, k);
      updateTouchControls();
      if (k === "jump") game.keys.add("Space");
      if (k === "interact") game.interact();
      if (k === "aim") game.toggleAim();
      if (k === "fire") game.attack();
      if (k === "torch") game.useTorch();
      if (k === "dodge") game.evade();
      if (k === "crouch") game.toggleCrouch();
    });
    const release = (event) => {
      const control = heldTouchControls.get(event.pointerId);
      heldTouchControls.delete(event.pointerId);
      if (game) {
        updateTouchControls();
        if (control === "jump") game.keys.delete("Space");
      }
    };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("lostpointercapture", release);
  });
}
function selectChapter(i, animate = true) {
  selected = i;
  const l = LEVELS[i];
  document.querySelectorAll("[data-chapter]").forEach((b, j) => {
    b.classList.toggle("selected", i === j);
    b.setAttribute("aria-pressed", i === j);
    b.querySelector(".chapter-state").innerHTML = store.data.levels[
      LEVELS[j].id
    ]?.completed
      ? icon("Check")
      : i === j
        ? '<span class="tiny-dot"></span> SELECTED'
        : icon("ArrowUpRight");
  });
  const hero = document.querySelector("#hero-art");
  hero.className = `hero-art ${i ? "hero-atlas atlas-" + i : ""}`;
  document.querySelector("#chapter-current").textContent = number(i + 1);
  document.querySelector("#scene-location").textContent = l.location
    .split(", ")
    .at(-1);
  document.querySelector("#scene-caption").textContent =
    i === 0 ? "Where the story begins." : l.tag + ".";
  document.querySelector("#begin-button span").textContent = store.data.levels[
    l.id
  ]?.position
    ? "Continue expedition"
    : i === 0
      ? "Begin expedition"
      : `Explore chapter ${number(i + 1)}`;
  document.querySelector("#previous-chapter").disabled = i === 0;
  document.querySelector("#next-chapter").disabled = i === 7;
  icons();
  if (animate) audio.tone();
}
function updateProgress() {
  const total = store.total();
  document.querySelector("#journal-count").textContent = total.notes || "";
  document.querySelector("#save-status").textContent = store.available
    ? "LOCAL SAVE ACTIVE"
    : "SAVING UNAVAILABLE";
}
function toast(message, duration = 3500) {
  const el = document.querySelector("#toast");
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.remove("hidden");
  toastTimer = setTimeout(() => el.classList.add("hidden"), duration);
}
function finishLoadingUI() {
  document.querySelector("#loading").classList.add("hidden");
  document.querySelector("#launcher").inert = false;
  document.querySelector("#game-screen").inert = false;
}
function returnFromStartup() {
  finishLoadingUI();
  document.querySelector("#launcher").classList.remove("hidden");
  document.querySelector("#game-screen").classList.add("hidden");
  selectChapter(selected, false);
  updateProgress();
  document.querySelector("#begin-button").focus();
}
function cancelStartup(showLauncher = true) {
  const request = startup;
  if (!request) return;
  startup = null;
  request.controller.abort();
  request.rollback?.();
  game?.stop();
  request.batch?.manager.abort();
  clearTouchControls();
  inGame = false;
  if (showLauncher) returnFromStartup();
}
function startGame(index) {
  if (!LEVELS[index]) return Promise.resolve(false);
  if (startup?.index === index) return startup.promise;
  cancelStartup(false);
  const request = { index, controller: new AbortController() };
  startup = request;
  request.promise = runStartup(request);
  return request.promise;
}
async function runStartup(request) {
  const { index, controller } = request;
  try {
    closeModal(false);
    game?.stop();
    inGame = false;
    clearTouchControls();
    // Unlock audio in the initiating gesture, then keep loading silent.
    audio.init();
    audio.resume();
    audio.pause();
    const loading = document.querySelector("#loading");
    loading.classList.remove("hidden");
    document.querySelector("#launcher").inert = true;
    document.querySelector("#game-screen").inert = true;
    document.querySelector("#loading-status").textContent =
      "Preparing your expedition…";
    document.querySelector("#loading-title").textContent = LEVELS[index].title;
    document.querySelector("#cancel-loading").focus();
    const { Adventure } = await waitForTask(
      import("./game.js"),
      controller.signal,
    );
    await waitForTask(
      new Promise((resolve) => setTimeout(resolve, 32)),
      controller.signal,
    );
    document.querySelector("#launcher").classList.add("hidden");
    document.querySelector("#game-screen").classList.remove("hidden");
    if (!game)
      game = new Adventure(
        document.querySelector("#game-canvas"),
        store,
        audio,
        {
          update: updateHUD,
          toast,
          pause: () => (currentModal ? closeModal() : showPause()),
          map: showMap,
          journal: showJournal,
          puzzle: showPuzzle,
          counterweights: showCounterweightGuide,
          fireVault: showFireVaultGuide,
          bellHoist: showBellHoistGuide,
          bellHoistRecord: () =>
            modal(
              HOIST_RECORD.title,
              `<div class="note-paper"><p>${HOIST_RECORD.text}</p><p>${HOIST_RECORD.note}</p></div><button class="primary-button" data-close>Return to the refuge</button>`,
              "note",
            ),
          note: showNote,
          complete: showComplete,
          saved: () => {
            const el = document.querySelector("#game-saved");
            el.style.opacity = 1;
            setTimeout(() => (el.style.opacity = 0.5), 1800);
          },
          damage: () => {
            const el = document.querySelector("#damage-flash");
            el.classList.remove("flash");
            void el.offsetWidth;
            el.classList.add("flash");
          },
        },
      );
    request.rollback = preserveChapterSave(store, LEVELS[index].id);
    try {
      game.load(LEVELS[index], index, { preparing: true });
    } finally {
      request.batch = game.assetBatch;
    }
    game.resize();
    await prepareChapter(game, {
      signal: controller.signal,
      onStage: (message) => {
        if (startup === request)
          document.querySelector("#loading-status").textContent = message;
      },
    });
    if (startup !== request || controller.signal.aborted) return false;
    game.preparing = false;
    game.active = true;
    inGame = true;
    selected = index;
    document.querySelector("#hud-title").textContent = LEVELS[index].title;
    document.querySelector("#hud-chapter-number").textContent =
      `CHAPTER ${number(index + 1)} / 08`;
    document.querySelector("#hud-location").textContent =
      LEVELS[index].location;
    finishLoadingUI();
    if (
      !store.data.levels[LEVELS[index].id]?.found?.length &&
      store.data.levels[LEVELS[index].id].time < 3
    )
      showBriefing(index);
    else if (document.hidden || !document.hasFocus()) showPause();
    else game.setPaused(false);
    game.save();
    audio.resume();
    startup = null;
    return true;
  } catch (error) {
    if (startup !== request) return false;
    startup = null;
    controller.abort();
    if (request.rollback) game.preparing = true;
    request.rollback?.();
    game?.stop();
    request.batch?.manager.abort();
    inGame = false;
    returnFromStartup();
    if (error.name === "AbortError") return false;
    console.error("Chapter preparation failed:", error);
    modal(
      "A moment before the adventure",
      `<p class="modal-description">${error.kind === "assets" ? "Some chapter files could not be loaded. Check your connection and try again." : "The chapter could not finish preparing. Try again, or choose Performance graphics in Settings."} Your saved progress has been preserved.</p><button class="primary-button full-width" id="retry-startup">Try loading again ${icon("RotateCcw")}</button><button class="text-button centered" data-close>Return to expeditions</button>`,
      "error",
    );
    document.querySelector("#retry-startup").onclick = () => startGame(index);
    return false;
  }
}
function updateHUD(s) {
  const stealth = s.stealth || {};
  const crouchButton = document.querySelector('[data-touch="crouch"]');
  crouchButton.setAttribute("aria-pressed", String(!!stealth.crouching));
  crouchButton.textContent = stealth.crouching ? "Stand" : "Crouch";
  crouchButton.classList.toggle("hidden", !!s.swimming);
  const notice = document.querySelector("#stealth-status");
  notice.classList.toggle("hidden", !stealth.active && !stealth.crouching);
  notice.dataset.state = stealth.active ? stealth.state : "quiet";
  document.querySelector("#stealth-label").textContent = stealth.active
    ? stealth.state.toUpperCase()
    : "CROUCHED · QUIET STEPS";
  const meter = notice.querySelector("[role=meter]");
  const awareness = Math.round((stealth.awareness || 0) * 100);
  meter.setAttribute("aria-valuenow", awareness);
  meter.querySelector("i").style.width = `${awareness}%`;
  notice.querySelector(".stealth-bearing").style.transform =
    `rotate(${stealth.bearing || 0}rad)`;
  const aim = s.aim || {};
  const reticle = document.querySelector(".crosshair");
  reticle.classList.toggle("aiming", !!aim.active);
  reticle.classList.toggle("on-target", !!aim.target);
  reticle.dataset.feedback = aim.feedback || "";
  const aimButton = document.querySelector('[data-touch="aim"]');
  aimButton.setAttribute("aria-pressed", String(!!aim.active));
  aimButton.classList.toggle("hidden", s.swimming);
  document.querySelector("#aim-status").textContent =
    aim.feedback === "shield"
      ? "SHIELDED"
      : aim.obstructed
        ? "MUZZLE BLOCKED"
        : "";
  document.querySelector("#health-bar").style.width = `${s.health}%`;
  document.querySelector("#health-value").textContent = Math.ceil(s.health);
  document.querySelector("#stamina-bar").style.width = `${s.stamina}%`;
  const diveVitals = document.querySelector("#dive-vitals");
  const inWater = s.archive !== null && s.swimming;
  diveVitals.classList.toggle("hidden", !inWater);
  diveVitals.classList.toggle("low-air", s.diveAir < 10);
  document.querySelector("#dive-air-value").textContent =
    `${Math.ceil(s.diveAir)} s`;
  document.querySelector("#dive-air-bar").style.width =
    `${(s.diveAir / 32) * 100}%`;
  diveVitals
    .querySelector("[role=meter]")
    .setAttribute("aria-valuenow", Math.ceil(s.diveAir));
  document
    .querySelector('[data-touch="dive"]')
    .classList.toggle("hidden", !inWater);
  document
    .querySelector('[data-touch="fire"]')
    .classList.toggle("hidden", inWater);
  document.querySelector('[data-touch="jump"]').textContent = s.diving
    ? "Rise"
    : "Jump";
  const torchButton = document.querySelector('[data-touch="torch"]');
  document
    .querySelector("#game-screen")
    .classList.toggle("has-torch", s.torch != null);
  torchButton.classList.toggle("hidden", s.torch == null);
  torchButton.textContent = s.torch ? "Put out" : "Torch";
  torchButton.setAttribute("aria-pressed", String(s.torch === true));
  torchButton.setAttribute(
    "aria-label",
    s.torch ? "Put out torch" : "Light torch at a fire",
  );
  const torchStatus = document.querySelector("#torch-status");
  torchStatus.classList.toggle("hidden", !s.torch);
  torchStatus.textContent = s.torch ? "TORCH LIT" : "";
  const controls = document.querySelector(".hud-controls");
  if (controls.dataset.diving !== `${s.diving}/${s.torch != null}`) {
    controls.dataset.diving = `${s.diving}/${s.torch != null}`;
    controls.innerHTML = (
      s.diving
        ? [
            ["W A S D", "Swim"],
            ["X", "Descend"],
            ["SPACE", "Rise"],
            ["E", "Use / recover"],
            ["J", "Journal"],
            ["ESC", "Pause"],
          ]
        : [
            ["W A S D", "Move"],
            ["SPACE", "Jump / climb"],
            ["E", "Interact"],
            ["V / RMB", "Aim"],
            ["F", "Fire"],
            ["R", "Dodge"],
            ["B", "Crouch"],
            ...(s.torch != null ? [["T", "Torch"]] : [["Q", "Instinct"]]),
            ["M", "Map"],
          ]
    )
      .map(([key, label]) => `<span><kbd>${key}</kbd> ${label}</span>`)
      .join("");
  }
  document.querySelector("#medkit-count").textContent = s.medkits;
  document.querySelector("#treasure-count").textContent = `${s.treasures} / 6`;
  document.querySelector("#objective-progress").textContent = s.bellHoist
    ? `${number(s.bellHoist.step)} / 03`
    : s.fireVault
      ? `${number(s.fireVault.lit)} / 03`
      : s.gallery
        ? `${number(s.galleryStage)} / 02`
        : s.diving
          ? `${number(s.archive)} / 05`
          : `${number(s.stage + 1)} / ${number(s.total + 1)}`;
  document.querySelector("#objective-text").textContent = s.objective;
  document.querySelector("#objective-distance").textContent = s.target
    ? `${s.distance} m away`
    : "";
  document.querySelector("#objective-detail").textContent = s.mission
    ? `${s.mission.place} · ${s.fieldTask ? `Field station ${s.fieldTask.step + 1} / 3` : "Sanctuary mechanism"}${s.carrying ? " · Carrying component" : ""}`
    : "";
  if (s.bellHoist)
    document.querySelector("#objective-detail").textContent =
      "Optional tomb · The bellkeepers’ hoist · M shows all three floors";
  else if (s.fireVault)
    document.querySelector("#objective-detail").textContent =
      "Optional tomb · The Rainkeeper’s causeway · M shows connected crossings";
  else if (s.gallery)
    document.querySelector("#objective-detail").textContent =
      "Optional exploration · Memorial gallery · Bronze air bells replenish your breath";
  else if (s.diving)
    document.querySelector("#objective-detail").textContent =
      "Optional exploration · Five sounding wells · Pause → Field journal";
  else if (s.archive !== null)
    document.querySelector("#objective-detail").textContent +=
      ` · Tidekeeper's atlas ${s.archive} / 5 · J to read`;
  const prompt = document.querySelector("#interaction-prompt");
  prompt.classList.toggle("hidden", !s.nearest && !s.traversalHint);
  const touchLabels = matchMedia("(pointer:coarse)").matches;
  const controlLabel = (text) =>
    touchLabels
      ? text
          .replace(/\bSpace\b/g, s.diving ? "Rise" : "Jump")
          .replace(/\bE\b/g, "Use")
          .replace(/\bX\b/g, "Dive")
      : text;
  prompt.querySelector("kbd").textContent = controlLabel(
    s.traversalHint?.key ?? "E",
  );
  if (s.traversalHint)
    prompt.querySelector("span").textContent = controlLabel(
      s.traversalHint.label,
    );
  else if (s.nearest)
    prompt.querySelector("span").textContent = [
      "field",
      "solar",
      "bell",
      "hydraulic",
      "thermal",
      "resonator",
      "wind",
      "cipher",
    ].includes(s.nearest.type)
      ? s.nearest.label
      : {
          mechanism: "Examine ancient mechanism",
          camp: "Rest at base camp",
          note: "Read field journal",
          treasure: "Recover ancient cache",
          relic: "Claim the relic",
        }[s.nearest.type];
  document
    .querySelector("#sense-label")
    .classList.toggle("hidden", s.sense <= 0);
  const angle = ((((s.yaw * 180) / Math.PI) % 360) + 360) % 360;
  document.querySelector("#heading").textContent = [
    "N",
    "NW",
    "W",
    "SW",
    "S",
    "SE",
    "E",
    "NE",
  ][Math.round(angle / 45) % 8];
  drawMap(document.querySelector("#minimap"), false, s);
  updateWaypoint(s);
}
function updateWaypoint(s) {
  const el = document.querySelector("#waypoint");
  if (!s.target || !game) {
    el.style.display = "none";
    return;
  }
  const point = game.player.position
    .clone()
    .set(
      s.target.x * 7,
      game.groundHeight(s.target.x * 7, s.target.z * 7) +
        (s.target.yOffset || 0) +
        4,
      s.target.z * 7,
    )
    .project(game.camera);
  const visible =
    point.z < 1 && point.x > -1 && point.x < 1 && point.y > -1 && point.y < 1;
  el.style.display = visible ? "flex" : "none";
  if (visible) {
    el.style.left = `${(point.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-point.y * 0.5 + 0.5) * 100}%`;
    el.querySelector("span").textContent = `${s.distance} m`;
  }
}
function drawMap(canvas, full = false, s = game?.state()) {
  if (!game || !s) return;
  if (s.bellHoist) return drawBellHoistMap(canvas, game, full);
  if (s.fireVault) return drawFireVaultMap(canvas, game, full);
  if (s.gallery) return drawGalleryMap(canvas, game, full);
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  c.clearRect(0, 0, w, h);
  c.fillStyle = full ? "#141d19" : "#14221acc";
  c.fillRect(0, 0, w, h);
  const size = game.map.size,
    scale = full ? (w - 40) / size : 2.65;
  const px = s.position.x / 7,
    pz = s.position.z / 7,
    ox = full ? 20 : w / 2 - px * scale,
    oz = full ? 20 : h / 2 - pz * scale;
  c.fillStyle = "#536457";
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++)
      if (game.map.grid[z][x] && game.explored.has(`${x},${z}`))
        c.fillRect(
          ox + x * scale,
          oz + z * scale,
          Math.ceil(scale),
          Math.ceil(scale),
        );
  for (const f of game.items) {
    if (game.progress.found.includes(f.id)) continue;
    if (
      f.type === "field" &&
      (f.stage < game.progress.stage || game.progress.field.includes(f.id))
    )
      continue;
    if (
      !game.explored.has(`${Math.round(f.x)},${Math.round(f.z)}`) &&
      f !== s.target
    )
      continue;
    if (f.type === "mechanism" && f.stage < game.progress.stage) continue;
    if (f.type === "solar" && f.stage !== game.progress.stage) continue;
    if (
      ["bell", "hydraulic", "thermal", "resonator", "wind"].includes(f.type) &&
      f.stage !== game.progress.stage
    )
      continue;
    if (
      !full &&
      s.sense <= 0 &&
      f !== s.target &&
      !["camp", "mechanism"].includes(f.type)
    )
      continue;
    c.fillStyle =
      f === s.target
        ? "#edc180"
        : f.type === "camp"
          ? "#a1c99c"
          : f.type === "note"
            ? "#96b9d0"
            : "#94815e";
    c.beginPath();
    c.arc(
      ox + f.x * scale + scale / 2,
      oz + f.z * scale + scale / 2,
      f === s.target ? (full ? 5 : 3) : full ? 3 : 2,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  if (full || s.sense > 0)
    for (const e of game.enemies)
      if (
        e.hp > 0 &&
        game.explored.has(
          `${Math.round(e.group.position.x / 7)},${Math.round(e.group.position.z / 7)}`,
        )
      ) {
        c.fillStyle = "#c07a67";
        c.fillRect(
          ox + (e.group.position.x / 7) * scale - 2,
          oz + (e.group.position.z / 7) * scale - 2,
          4,
          4,
        );
      }
  c.save();
  c.translate(ox + px * scale + scale / 2, oz + pz * scale + scale / 2);
  c.rotate(-s.yaw);
  c.fillStyle = "#fff9e8";
  c.beginPath();
  c.moveTo(0, -7);
  c.lineTo(5, 5);
  c.lineTo(0, 2);
  c.lineTo(-5, 5);
  c.closePath();
  c.fill();
  c.restore();
  if (!full) {
    c.strokeStyle = "#cab68a40";
    c.strokeRect(0.5, 0.5, w - 1, h - 1);
  }
}
function modal(
  title,
  body,
  type = "default",
  eyebrow = "VESPER · THE HOLLOW EARTH",
  wide = false,
) {
  mountedPuzzle?.dispose();
  mountedPuzzle = null;
  if (game) {
    game.orreryFocus = null;
    game.bellFocus = null;
    game.hydraulicFocus = null;
    game.thermalFocus = null;
    game.resonanceFocus = null;
    game.windFocus = null;
    game.cipherFocus = null;
  }
  if (inGame) {
    game.setPaused(true);
    audio.setMode(
      type === "puzzle"
        ? "puzzle"
        : ["note", "journal"].includes(type)
          ? "reading"
          : "pause",
    );
  }
  currentModal = type;
  document.querySelector("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal ${wide ? "modal-wide" : ""} modal-${type}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-button" aria-label="Close dialog">${icon("X")}</button><span class="eyebrow">${eyebrow}</span><h2 id="modal-title">${title}</h2>${body}</section></div>`;
  icons();
  document.querySelector(".modal-close").onclick = () => closeModal();
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => closeModal()));
  document.querySelector(".modal-close").focus();
  const panel = document.querySelector(".modal");
  panel.addEventListener("keydown", (e) => {
    if (e.code !== "Tab") return;
    const nodes = [
        ...panel.querySelectorAll("button,input,select,a[href]"),
      ].filter((n) => !n.disabled),
      first = nodes[0],
      last = nodes.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
function closeModal(resume = true) {
  mountedPuzzle?.dispose();
  mountedPuzzle = null;
  document.querySelector("#modal-root").innerHTML = "";
  currentModal = null;
  if (game?.cipherFocus != null) {
    game.cipherFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (game?.windFocus != null) {
    game.windFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (game?.resonanceFocus != null) {
    game.resonanceFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (game?.thermalFocus !== null && game?.thermalFocus !== undefined) {
    game.thermalFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (game?.hydraulicFocus !== null && game?.hydraulicFocus !== undefined) {
    game.hydraulicFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (game?.bellFocus !== null && game?.bellFocus !== undefined) {
    game.bellFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (game?.orreryFocus !== null && game?.orreryFocus !== undefined) {
    game.orreryFocus = null;
    game.presentationRemaining = 0;
    game.updateCamera(1);
  }
  if (inGame && resume) game.setPaused(false);
  returnModal = null;
}
function showBriefing(index) {
  const l = LEVELS[index];
  modal(
    l.title,
    `<div class="briefing-image atlas-${index}"></div><p class="modal-description">${l.description}</p><div class="briefing-goal">${icon("Compass")}<div><span class="eyebrow">EXPEDITION OBJECTIVE</span><p>${l.goal}. Recover ${l.artifact}.</p></div></div><div class="briefing-controls"><span><kbd>W A S D</kbd> Move</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>E</kbd> Interact</span><span><kbd>M</kbd> Map</span></div><p class="small-copy">Click the world to look with your mouse. Press Esc to release it. You can also turn with Z / C, or hold the right mouse button. Gold markers point toward your next objective.</p><button class="primary-button full-width" data-close>Enter the unknown ${icon("ArrowUpRight")}</button>`,
    "briefing",
    `CHAPTER ${number(index + 1)} · ${l.location}`,
  );
}
function showPause() {
  if (!inGame) return;
  modal(
    "A moment to breathe.",
    `<p class="modal-description">${game.level.title} · ${formatTime(game.progress.time)} in the field</p><div class="pause-stats"><div><strong>${game.progress.stage}<small> / ${game.level.mechanisms}</small></strong><span>Mechanisms restored</span></div><div><strong>${game.state().notes}<small> / 12</small></strong><span>Journal pages found</span></div></div><div class="pause-buttons"><button class="primary-button full-width" data-close>Continue the expedition ${icon("ArrowRight")}</button><button class="secondary-button" id="pause-map">${icon("Compass")} Expedition map</button><button class="secondary-button" id="pause-journal">${icon("BookOpen")} Field journal</button><button class="secondary-button" id="pause-guide">${icon("BookOpen")} Field guide</button><button class="secondary-button" id="pause-settings">${icon("Settings2")} Settings</button><button class="text-button" id="return-camp">${icon("RotateCcw")} Return to last checkpoint</button><button class="text-button" id="quit-game">${icon("ArrowLeft")} Save & return to expedition</button></div><p class="save-copy">${icon("ShieldCheck")} Your latest progress has been saved${store.available ? "." : " in memory. Browser storage is unavailable."}</p>`,
    "pause",
    "EXPEDITION PAUSED",
  );
  document.querySelector("#pause-map").onclick = showMap;
  document.querySelector("#pause-journal").onclick = showJournal;
  document.querySelector("#pause-guide").onclick = showGuide;
  document.querySelector("#pause-settings").onclick = showSettings;
  document.querySelector("#return-camp").onclick = () => {
    game.returnToCheckpoint();
    closeModal();
    toast("Returned to your last checkpoint.");
  };
  document.querySelector("#quit-game").onclick = () => {
    game.stop();
    inGame = false;
    closeModal();
    document.querySelector("#launcher").classList.remove("hidden");
    document.querySelector("#game-screen").classList.add("hidden");
    document.querySelector("#chapter-track").innerHTML =
      LEVELS.map(chapterCard).join("");
    document
      .querySelectorAll("[data-chapter]")
      .forEach(
        (b) => (b.onclick = () => selectChapter(Number(b.dataset.chapter))),
      );
    selectChapter(selected, false);
    updateProgress();
  };
}
function showMap() {
  if (!inGame) return;
  const state = game.state();
  modal(
    "Follow the forgotten paths.",
    `<div class="map-layout"><canvas id="full-map" width="570" height="570"></canvas><aside><span class="eyebrow">${game.level.location}</span><h3>${game.level.title}</h3><p>${state.objective}</p>${
      !state.gallery && !state.fireVault && !state.bellHoist && state.mission
        ? `<p class="small-copy">${game.state().mission.briefing}</p><ol class="field-checklist">${game
            .state()
            .mission.tasks.map(
              (t) =>
                `<li class="${game.progress.field.includes(t.id) ? "done" : ""}">${t.label}</li>`,
            )
            .join("")}</ol>`
        : ""
    } ${state.bellHoist ? `<p class="small-copy">West and east lifts share a counterweight: raising one lowers the other. Use the lever aboard a platform to visit its next landing; landing controls call it back. Explore the broken middle gallery, then restore the bell above the east lift. The upper crossing leads to the refuge archive.</p>` : state.fireVault ? `<div class="map-legend"><span><i style="background:#fff8d8"></i>You are here</span><span><i style="background:#d8c491"></i>Lowered crossing</span><span><i style="background:#ffb75d"></i>Lit sanctuary lamp</span><span><i style="background:#728f90"></i>Unlit lamp</span></div><p class="small-copy">Numbers mark the six handwheels. The thin arms show their current directions; facing arms lower a crossing. Swim to plan your route, then bring a torch from the entrance fire. Every lit lamp can supply another flame.</p>` : state.gallery ? `<div class="map-legend"><span><i style="background:#fff3c6"></i>You are here</span><span><i style="background:#e4c885"></i>Bronze air bell</span><span><i style="background:#c19562"></i>Closed gate</span><span><i style="background:#83bda8"></i>Open gate</span></div><p class="small-copy">Follow the bronze survey line. Air bells replenish your breath; dive beneath their skirts to leave. The emergency wheel opens the memorial and the eastern return passage. Your next reload returns to the last bell where you breathed.</p>` : `<span class="map-distance">${game.state().distance} m to objective</span><div class="map-legend"><span><i style="background:#fff9e8"></i>You are here</span><span><i style="background:#edc180"></i>Current objective</span><span><i style="background:#a1c99c"></i>Base camp</span><span><i style="background:#96b9d0"></i>Journal page</span><span><i style="background:#94815e"></i>Relic / mechanism</span><span><i style="background:#c07a67"></i>Guardian</span></div><p class="small-copy">Your map fills as you explore. Surveyed paths, discoveries, and checkpoints are saved together. The gold beacon points toward your next objective.</p>`}<button class="secondary-button" data-close>Return to the world ${icon("ArrowRight")}</button></aside></div>`,
    "map",
    "EXPEDITION CARTOGRAPHY",
    true,
  );
  drawMap(document.querySelector("#full-map"), true);
}
function showGuide() {
  modal(
    "Leave no story buried.",
    `<p class="modal-description">You are Vesper Vale. Archaeologist, climber, and daughter of a woman who vanished following a compass that pointed down. Eight places hold the truth.</p><div class="guide-grid"><article>${icon("Footprints")}<h3>Find your own way</h3><p>Explore the stone paths between sanctuaries. Jump fallen masonry, follow the gold objective marker, and open your map when the trail gets lost. You swim automatically in deep pools. In the Drowned Kingdom, hold X (Dive on touch) to descend and Space (Rise) to surface. Release both to hold your depth. Follow the bronze floats and bubbles to five sunken records; recover them with Use, then read them in your journal. Watch your air: the last ten seconds are marked amber. Refill at the surface before diving again. Swimming toward a shallow bank exits the water; Space toward a nearby ledge lets you climb out. A passage in the western bank of the first sounding well leads beneath the harbor court. Bronze air bells refill your breath; dive below their skirts to leave. Find the emergency wheel beyond the collapsed colonnade to open the memorial and its return passage. Reloading in the gallery returns you to your last air bell; other dives return to the surface, with discoveries retained.</p></article><article>${icon("Sun")}<h3>Read the ancient world</h3><p>Follow the three field stations in each sector to open its sanctuary gate. Carry missing components, work valves and winches, light beacons, and climb the gilded towers. Follow the gold ledges, jump gaps, and hold E while jumping toward a hanging rope to catch it. Hold a direction to swing, then press Space to release toward the far ledge. Restored tower stations unlock a return cable; press E on the summit to ride it. Your last secure ledge saves as you climb. In the cliffside city, anchor controls unfold suspended crossings. Jump the missing boards; the attached safety tether returns a missed crossing to the last bank. The first sanctuary of each chapter also contains a counterweight chamber. Read its entrance tablet, grip a carved stone with Use, and use forward/backward to push or pull. Match named sockets, balance the marked loads, and keep clear tracks empty. Release the stone to approach another face; the tablet can reset the chamber. Then inspect the mechanism’s inscription. Decipher glyphs, route sunlight, recall bell sequences, balance water vessels, cool furnaces, connect wind channels, tune crystals, and align the celestial rings.</p></article><article>${icon("Crosshair")}<h3>Keep your distance</h3><p>Press B (Crouch on touch) to move slowly with quiet steps. Watch where guardians face, and use solid cover to break their sight. An amber meter and arrow show suspicion and its direction; a full meter means you have been detected. A guardian investigates footsteps or gunfire at the place it heard them, searches there, then returns to its post. Crouching helps you slip behind one, but a close approach or a lit torch can expose you. Aiming, firing, jumping and dodging stand you up. Guardians signal attacks with glowing ground marks. Move clear or press R with a direction to dodge; without a direction, you evade backward. Hunters charge, sentries launch bolts, and shield keepers expose their cores after striking. Hold the right mouse button or toggle V (Aim on touch) for shoulder aiming. Move the crosshair onto a guardian and fire with F or a locked left click; aimed shots can miss and stop at cover. Drag the world to look on touch, or use Z/C and I/K to adjust the view from the keyboard. Movement while aiming is slower. F without aiming keeps directional assistance. A blue diamond and SHIELDED mean the armor stopped your shot. Dodging costs stamina and requires free hands on firm ground.</p></article><article>${icon("Flame")}<h3>Make camp. Carry on.</h3><p>Base camps restore health and supplies. In the jungle, press T (Torch on touch) beside a campfire or a burning brazier to light your torch. Carry the flame to unlit braziers and use E. Swimming, combat, and actions needing both hands put it out; completed beacons remain lit. Every solved mechanism becomes a checkpoint. Discoveries and progress save automatically.</p></article></div><div class="controls-table">${[
      ["W A S D / ↑ ↓ ← →", "Move"],
      ["MOUSE / Z C", "Look around"],
      ["SHIFT", "Sprint"],
      ["SPACE", "Jump / climb low obstacles"],
      ["E", "Interact"],
      ["F / CLICK", "Fire sidearm"],
      ["RMB / V", "Hold / toggle shoulder aim"],
      ["Z / C · I / K", "Look left / right · up / down"],
      ["R + DIRECTION", "Dodge · uses stamina"],
      ["B", "Toggle crouch · quiet steps"],
      ["X / SPACE", "Dive / rise · Drowned Kingdom"],
      ["T", "Light / put out torch · jungle"],
      ["Q", "Explorer’s instinct"],
      ["H", "Use medical supply"],
      ["M", "Expedition map"],
      ["J", "Field journal"],
      ["ESC", "Pause / close"],
    ]
      .map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`)
      .join(
        "",
      )}</div><p class="small-copy">All eight chapters are open to explore in any order. Each has its own objectives, relic, environment, and map. Completion time depends on your pace; follow side paths for the full expedition. Keyboard and mouse recommended. Touch controls are available on small screens.</p><button class="primary-button full-width" data-close>The world is waiting ${icon("ArrowUpRight")}</button>`,
    "guide",
    "THE EXPLORER’S FIELD GUIDE",
    true,
  );
}
function showJournal() {
  const hoist = store.data.levels.frost?.bellHoist;
  const hoistSection = hoist?.visited
    ? `<section class="tide-journal"><span class="eyebrow">THE BELLKEEPERS’ HOIST · ${hoist.recovered ? "RECOVERED" : "IN PROGRESS"}</span><h3>${HOIST_RECORD.title}</h3><p>${hoist.recovered ? HOIST_RECORD.text : "A path east of the western library trail reaches the old cargo hoist. Two platforms share one counterweight. Find the bell’s bronze tongue in the middle gallery, carry it to the upper east bell, and reopen the refuge."}</p>${hoist.recovered ? `<p class="small-copy">${HOIST_RECORD.note}</p>` : ""}</section>`
    : "";
  const vault = store.data.levels.verdant?.fireVault;
  const vaultSection = vault?.visited
    ? `<section class="tide-journal"><span class="eyebrow">THE RAINKEEPER’S CAUSEWAY · ${vault.recovered ? "RECOVERED" : `${vault.lit.length} / 3 FIRES`}</span><h3>${VAULT_RECORD.title}</h3><p>${vault.recovered ? VAULT_RECORD.text : "A flooded hall south of the jungle’s entrance camp contains six turning crossings. Read the tablet beside its entrance fire, connect the carved arms, then carry fire to the three sanctuary lamps. Their flames release the archive on the far bank."}</p>${vault.recovered ? `<p class="small-copy">${VAULT_RECORD.note}</p>` : ""}</section>`
    : "";
  const gallery = store.data.levels.tides?.gallery;
  const gallerySection = gallery?.visited?.length
    ? `<section class="tide-journal"><span class="eyebrow">THE SUBMERGED MEMORIAL · ${gallery.recovered ? "RECOVERED" : "IN PROGRESS"}</span><h3>${GALLERY_RECORD.title}</h3>${gallery.recovered ? `<p>${GALLERY_RECORD.text}</p><p class="small-copy">${GALLERY_RECORD.note}</p>` : "<p>A passage beneath the harbor well leads to the tidekeepers' memorial. Follow the bronze survey line, use the two air bells to catch your breath, and find the emergency wheel beyond the collapsed colonnade. It opens the memorial and an eastern return passage.</p>"}</section>`
    : "";
  const archive = TIDE_ARCHIVE.filter((r) =>
    store.data.levels.tides?.archive?.includes(r.id),
  );
  const archiveSection = store.data.levels.tides
    ? `<section class="tide-journal"><span class="eyebrow">THE TIDEKEEPER’S ATLAS · ${archive.length} / 5</span><h3>A city beneath a city</h3><p>Five bronze floats mark the old sounding wells. Begin beside the harbor sanctuary, follow the bubbles below the water, and recover the sealed survey cases. Each record describes another well. Read safely at the surface, or pause here to review your discoveries.</p>${archive.map((r) => `<article><span class="eyebrow">${r.well}</span><h3>${r.title}</h3><p>${r.text}</p><p class="small-copy">${r.clue}</p></article>`).join("")}${archive.length === 5 ? '<p class="atlas-complete">ATLAS COMPLETE · The drowned kingdom’s evacuation is remembered.</p>' : ""}</section>`
    : "";
  const memories = RESONANCE_TRIALS.slice(
    0,
    Math.min(8, store.data.levels.crystal?.stage || 0),
  );
  const entries = [];
  for (const l of LEVELS) {
    const p = store.data.levels[l.id];
    p?.found
      .filter((id) => id.startsWith("note"))
      .forEach((id) =>
        entries.push({ l, index: Number(id.split("-")[1]) % 12 }),
      );
  }
  modal(
    "The things we leave behind.",
    `<p class="modal-description">Fragments of a lost expedition. A mother’s words. Your own story, still being written.</p><div class="journal-top"><span>${entries.length} / 96 PAGES DISCOVERED</span><span>${formatTime(store.total().time)} IN THE FIELD</span></div>${hoistSection}${vaultSection}${gallerySection}${archiveSection}${entries.length || memories.length || archive.length || gallerySection || vaultSection || hoistSection ? `<div class="journal-entries">${memories.map((m, i) => `<article><span class="eyebrow">RECOVERED MEMORY · ${number(i + 1)} / 08</span><h3>${m.title}</h3><p>${m.memory}</p></article>`).join("")}${entries.map(({ l, index }) => `<article><span class="eyebrow">${l.title}</span><h3>${readNote(l.id, index)[0]}</h3><p>${readNote(l.id, index)[1]}</p></article>`).join("")}</div>` : `<div class="empty-state">${icon("BookOpen")}<h3>Every journey begins with a blank page.</h3><p>Look for blue journal markers along the side paths.<br>Your discoveries will be collected here.</p><button class="secondary-button" id="journal-explore">${inGame ? "Return to your expedition" : "Begin your expedition"} ${icon("ArrowUpRight")}</button></div>`}`,
    "journal",
    "FIELD JOURNAL",
    true,
  );
  const b = document.querySelector("#journal-explore");
  if (b) b.onclick = () => (inGame ? closeModal() : startGame(selected));
}
function showCollection() {
  modal(
    "History, held in your hands.",
    `<p class="modal-description">Eight relics. One impossible connection. Complete each chapter to uncover a piece of the Hollow Earth.</p><div class="collection-grid">${LEVELS.map(
      (l, i) => {
        const found = store.data.levels[l.id]?.completed;
        return `<article class="collection-item ${found ? "discovered" : ""}"><div class="collection-gem">${icon(found ? "Gem" : "HelpCircle")}</div><span class="eyebrow">CHAPTER ${number(i + 1)}</span><h3>${l.artifact}</h3><p>${l.title}</p><span class="relic-status">${found ? "RECOVERED" : "AWAITING DISCOVERY"}</span></article>`;
      },
    ).join("")}</div>`,
    "collection",
    "THE RELIQUARY",
    true,
  );
}
function showSettings() {
  const settings = store.data.settings;
  modal(
    "Make yourself at home.",
    `<p class="modal-description">Tune the expedition to your world. Changes are saved automatically.</p><div class="settings-list"><label class="setting"><span><strong>Master volume</strong><small>Ambient soundscape and effects</small></span><div class="range-wrap"><input id="volume" type="range" min="0" max="100" value="${settings.volume}" aria-label="Master volume"/><output>${settings.volume}%</output></div></label>${[
      [
        "music",
        "Background music",
        "A quiet score that follows the chapter and objective",
      ],
      [
        "ambience",
        "World ambience",
        "Distance and direction of wildlife, water, fire, and wind",
      ],
      [
        "effects",
        "Actions and puzzle cues",
        "Footsteps, tools, guardians, and mechanism notes",
      ],
    ]
      .map(
        ([key, title, description]) =>
          `<label class="setting"><span><strong>${title}</strong><small>${description}</small></span><div class="range-wrap"><input id="${key}-volume" type="range" min="0" max="100" value="${settings[key]}" aria-label="${title}"/><output>${settings[key]}%</output></div></label>`,
      )
      .join(
        "",
      )}<label class="setting"><span><strong>Graphics quality</strong><small>Resolution, shadows, and atmosphere</small></span><select id="quality"><option value="low" ${settings.quality === "low" ? "selected" : ""}>Performance</option><option value="medium" ${settings.quality === "medium" ? "selected" : ""}>Balanced</option><option value="high" ${settings.quality === "high" ? "selected" : ""}>High fidelity</option></select></label><label class="setting"><span><strong>Look sensitivity</strong><small>Camera movement with your mouse</small></span><div class="range-wrap"><input id="sensitivity" type="range" min="10" max="100" value="${settings.sensitivity}" aria-label="Look sensitivity"/><output>${settings.sensitivity}%</output></div></label><label class="setting"><span><strong>Invert vertical look</strong><small>Reverse the vertical camera direction</small></span><input id="invert" type="checkbox" role="switch" ${settings.invertY ? "checked" : ""}/></label></div><div class="save-management"><span class="eyebrow">YOUR EXPEDITION, YOUR SAVE</span><p>Progress is stored in this browser. Export a backup to take your journey to another device.</p><div><button class="secondary-button" id="export-save">${icon("Download")} Export save</button><button class="secondary-button" id="import-save">${icon("Upload")} Import save</button><input type="file" id="save-file" accept="application/json,.json" hidden/></div></div><p class="small-copy audio-credits">Headphones reveal the direction of nearby sounds. Music softens during reading and listening puzzles. Field recordings: <a href="https://opengameart.org/content/stream-sounds" target="_blank" rel="noopener">Stream Sounds by kurt</a> (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>; edited for looping and level), birds by isaiah658, fire by PagDev, and water drips by Independent.nu (CC0). Original adaptive score by Vesper.</p><button class="primary-button full-width" data-close>Back to the adventure ${icon("ArrowRight")}</button>`,
    "settings",
    "EXPEDITION SETTINGS",
  );
  const apply = () => {
    store.save();
    audio.setVolume(muted ? 0 : settings.volume);
    audio.setMix(settings);
    game?.applySettings();
  };
  document.querySelector("#volume").oninput = (e) => {
    settings.volume = Number(e.target.value);
    if (settings.volume > 0) {
      muted = false;
      settings.muted = false;
      document.querySelector("#sound-toggle").innerHTML = icon("Volume2");
      icons();
    }
    e.target.nextElementSibling.value = `${settings.volume}%`;
    apply();
  };
  for (const key of ["music", "ambience", "effects"]) {
    document.querySelector(`#${key}-volume`).oninput = (e) => {
      settings[key] = Number(e.target.value);
      e.target.nextElementSibling.value = `${settings[key]}%`;
      apply();
    };
  }
  document.querySelector("#sensitivity").oninput = (e) => {
    settings.sensitivity = Number(e.target.value);
    e.target.nextElementSibling.value = `${settings.sensitivity}%`;
    apply();
  };
  document.querySelector("#quality").onchange = (e) => {
    settings.quality = e.target.value;
    apply();
    toast(
      "Graphics updated. Particle density takes effect on your next chapter.",
    );
  };
  document.querySelector("#invert").onchange = (e) => {
    settings.invertY = e.target.checked;
    apply();
  };
  document.querySelector("#export-save").onclick = () => {
    game?.save();
    const blob = new Blob([store.export()], { type: "application/json" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "vesper-expedition.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Expedition save exported.");
  };
  document.querySelector("#import-save").onclick = () =>
    document.querySelector("#save-file").click();
  document.querySelector("#save-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        parsed.version !== 1 ||
        !parsed.levels ||
        typeof parsed.levels !== "object" ||
        Array.isArray(parsed.levels)
      )
        throw new Error("This is not a Vesper save file.");
      modal(
        "Continue another journey?",
        `<p class="modal-description">Importing this save replaces the progress currently stored in this browser. Export your current save first if you want to keep both.</p><div class="confirm-actions"><button class="secondary-button" id="cancel-import">Keep current save</button><button class="primary-button" id="confirm-import">Import expedition ${icon("Upload")}</button></div>`,
        "import",
      );
      document.querySelector("#cancel-import").onclick = showSettings;
      document.querySelector("#confirm-import").onclick = () => {
        if (game?.active) game.stop();
        inGame = false;
        store.import(text);
        game = null;
        location.reload();
      };
    } catch (error) {
      toast(error.message);
    }
  };
}
function showNote(f, l) {
  const note = readNote(l.id, f.note);
  modal(
    note[0],
    `<div class="note-paper"><span class="note-number">FIELD NOTE ${number(f.note + 1)}</span><p>“${note[1]}”</p><span class="note-signature">From the journals of Elara Vale</span></div><p class="small-copy">Added to your field journal. Press J to read your discoveries.</p><button class="primary-button full-width" data-close>Carry her words with you ${icon("ArrowRight")}</button>`,
    "note",
    l.title.toUpperCase(),
  );
}
function showBellHoistGuide() {
  modal(
    "The bellkeepers’ hoist",
    `<p class="modal-description">Two cargo platforms, three floors, one shared counterweight.</p><div class="note-paper"><p>Board either platform and use its lever with <kbd>E</kbd> (Use on touch). It rises to the next landing, then returns to the ground after the upper floor. Its partner travels in the opposite direction.</p><p>Controls beside each landing call a platform to that floor. Step clear while it arrives, then board. Both platforms meet at the middle gallery. Jump the broken southern crossing and look for the small bronze bell tongue among the keeper’s belongings.</p><p>The upper east bell waits for its tongue. Its voice opens the archive door and unfolds the upper crossing. Open <kbd>M</kbd> to see all three floors. Lift stops and discoveries save; reloading during a ride restores your platform’s last completed stop.</p></div><button class="primary-button" data-close>Return to the hoist</button>`,
    "guide",
  );
}
function showFireVaultGuide(recovered = false) {
  modal(
    recovered ? VAULT_RECORD.title : "The Rainkeeper’s causeway",
    recovered
      ? `<div class="note-paper"><p>${VAULT_RECORD.text}</p><p class="small-copy">${VAULT_RECORD.note}</p></div><p class="small-copy">Added to the field journal. Your sanctuary fires and crossing positions are saved.</p><button class="primary-button" data-close>Return to the jungle ${icon("ArrowRight")}</button>`
      : `<p class="modal-description">“Turn the roads until their hands meet. Bring one flame to the travelers, one to the children, and one to those who arrive after dark.”</p><div class="note-paper"><p>Each platform’s bronze channels show its open sides. Two facing channels lower a crossing between them. Stand beside a handwheel and press <kbd>E</kbd> (Use on touch) to turn it a quarter turn. Vesper reaches for both grips and turns the ratchet; move away before the turn finishes to cancel. A completed turn saves, and the grips return without reversing the crossing.</p><p>You may swim to reach other handwheels while planning the route. Swimming puts your torch out. Light it with <kbd>T</kbd> beside the entrance fire, then carry the flame across dry crossings and use it at the three sanctuary lamps. A lit lamp can relight your torch.</p><p>The three fires release the archive grille on the far bank. <kbd>M</kbd> shows the crossing map. If you fall, swim to a platform and use <kbd>Space</kbd> toward its edge to climb out.</p></div><button class="primary-button" data-close>Explore the causeway ${icon("ArrowRight")}</button>`,
    "fire-vault",
  );
}

function showCounterweightGuide(chamber) {
  modal(
    chamber.trial.title,
    `<p class="modal-description">${chamber.trial.inscription}</p><ol class="field-checklist">${chamber.plates.map((plate) => `<li class="${plate.active ? "done" : ""}">${plate.goal.name} · ${plate.active ? "Holding" : "Waiting"}</li>`).join("")}</ol><div class="note-paper"><p>Grip a stone from an open face with <kbd>E</kbd> (Use on touch). While gripping, <kbd>W</kbd> / <kbd>↑</kbd> pushes and <kbd>S</kbd> / <kbd>↓</kbd> pulls. Press Use again to release, then walk around to another face.</p><p>Small cuts on each stone show its weight. Named sockets require the matching stone; numbered receivers count the total weight on their tiles. Clear tracks must contain no stones.</p></div><p class="small-copy">Settled moves save automatically. Resetting returns these stones to their starting positions and places you at this tablet.</p><div class="puzzle-actions"><button class="text-button" id="reset-counterweights" ${game.progress.stage > 0 ? "disabled" : ""}>Reset chamber</button><button class="primary-button" data-close>Return to the chamber ${icon("ArrowRight")}</button></div>`,
    "note",
    "SANCTUARY COUNTERWEIGHTS",
  );
  document.querySelector("#reset-counterweights").onclick = () => {
    game.resetCounterweights();
    closeModal();
  };
}
function showSolarGuide(f, l) {
  const site = game.solarSites.find((site) => site.stage === f.stage);
  modal(
    "A path for the sun",
    `<p class="modal-description">${l.objectiveNames[f.stage]}</p><div class="note-paper"><p>Follow the light through the court.</p></div><p class="small-copy">The west collector feeds ${site.mirrors.length} numbered mirrors in the forecourt. Walk to a handwheel and press <kbd>E</kbd> (Use on touch) to turn its reflector. Watch where the reflected beam stops and continue from there.</p><p class="small-copy">When light reaches the receiver on the east side, approach its small control and press Use to complete the circuit. Each mirror turn saves automatically. You can also operate the same mirrors from the diagram.</p><div class="pause-buttons"><button class="primary-button full-width" data-close>Return to the mirrors ${icon("ArrowRight")}</button><button class="secondary-button" id="solar-diagram">${icon("Compass")} Use diagram controls</button></div>`,
    "note",
    `SOLAR COURT · ${number(f.stage + 1)} / 09`,
  );
  document.querySelector("#solar-diagram").onclick = () =>
    showPuzzle(f, l, true);
}
function showBellGuide(f, l) {
  const lesson = BELL_LESSONS[f.stage],
    state = restorePuzzle(l, f.stage, game.progress.bells?.[f.stage]);
  modal(
    lesson.title,
    `<p class="modal-description">${l.objectiveNames[f.stage]}</p><div class="note-paper"><p>${lesson.instruction}</p></div><p class="small-copy">Listen and watch the four bronze bells. Then walk to their named ropes and press <kbd>E</kbd> (Use on touch) to give your answer. You can replay without losing the notes already entered.</p><p class="small-copy">YOUR ANSWER · ${state.values.length} / ${state.target.length}<br>${state.values.length ? state.values.map((n) => l.symbols[n]).join(" → ") : "No notes yet."}</p><div class="pause-buttons"><button class="primary-button full-width" id="listen-bell-court">${icon("Volume2")} Listen in the court</button><button class="secondary-button" id="bell-diagram">${icon("Volume2")} Use bell controls</button><button class="secondary-button" id="activate-bell-court">Activate the answer ${icon("ArrowRight")}</button><button class="text-button" id="clear-bell-court">Clear my answer</button></div><p id="bell-feedback" class="puzzle-feedback" role="status">Each note saves automatically.</p>`,
    "bell-guide",
    `BELLKEEPER'S LESSON · ${number(f.stage + 1)} / 08`,
  );
  document.querySelector("#listen-bell-court").onclick = () => {
    closeModal();
    game.playBellPhrase(f.stage);
  };
  document.querySelector("#bell-diagram").onclick = () =>
    showPuzzle(f, l, true);
  document.querySelector("#activate-bell-court").onclick = () => {
    if (isSolved(restorePuzzle(l, f.stage, game.progress.bells?.[f.stage]))) {
      closeModal(false);
      game.solve(f);
    } else
      document.querySelector("#bell-feedback").textContent =
        "The answer is not complete. Listen again, or clear the phrase to begin another answer.";
  };
  document.querySelector("#clear-bell-court").onclick = () => {
    game.setBellValues(f.stage, createPuzzle(l, f.stage));
    showBellGuide(f, l);
  };
}
function showHydraulicGuide(f, l) {
  const trial = HYDRAULIC_TRIALS[f.stage],
    current = restorePuzzle(l, f.stage, game.progress.hydraulics?.[f.stage]);
  modal(
    trial.title,
    `<p class="modal-description">${l.objectiveNames[f.stage]}</p><div class="note-paper"><p>${trial.instruction}</p></div><p class="small-copy">The royal measure is <strong>${trial.target.join(" / ")} units</strong> in cisterns I, II and III. Their capacities are ${trial.capacity.join(" / ")} units. Walk to a handwheel and press <kbd>E</kbd> (Use on touch) to select its cistern. Select a receiving cistern to start the transfer. Water travels along the marked pipes until the source is empty or the receiver is full. Selecting the same cistern cancels.</p><p class="small-copy">Watch the water and the gold gauge marks. Each completed command saves its measure. Return to this tablet to activate the pressure receiver, reset the supply, or use the focused controls.</p><p class="small-copy">CURRENT MEASURE · ${current.values.join(" / ")}</p><div class="pause-buttons"><button class="primary-button full-width" id="hydraulic-activate">Activate the pressure receiver ${icon("ArrowRight")}</button><button class="secondary-button" id="hydraulic-diagram">${icon("Droplets")} Inspect the hydraulic controls</button><button class="secondary-button" data-close>Return to the cisterns ${icon("ArrowRight")}</button><button class="text-button" id="hydraulic-reset">Reset the supply</button></div><p id="hydraulic-feedback" class="puzzle-feedback" role="status"></p>`,
    "note",
    `HYDRAULIC COURT · ${number(f.stage + 1)} / 09`,
  );
  document.querySelector("#hydraulic-diagram").onclick = () =>
    showPuzzle(f, l, true);
  document.querySelector("#hydraulic-activate").onclick = () => {
    if (
      isSolved(restorePuzzle(l, f.stage, game.progress.hydraulics?.[f.stage]))
    ) {
      closeModal(false);
      game.solve(f);
    } else
      document.querySelector("#hydraulic-feedback").textContent =
        "The royal measure is not balanced yet. Match all three gold gauge marks.";
  };
  document.querySelector("#hydraulic-reset").onclick = () => {
    game.setHydraulicValues(f.stage, createPuzzle(l, f.stage));
    showHydraulicGuide(f, l);
  };
}
function activateResonance(f, l) {
  if (!isSolved(restorePuzzle(l, f.stage, game.progress.resonance?.[f.stage])))
    return false;
  closeModal(false);
  const before = game.progress.stage;
  game.solve(f);
  if (game.progress.stage !== before + 1) return false;
  modal(
    RESONANCE_TRIALS[f.stage].title,
    `<div class="note-paper"><p>${RESONANCE_TRIALS[f.stage].memory}</p></div><p class="small-copy">This memory has been added to your field journal.</p><button class="primary-button full-width" data-close>Follow the remembered path ${icon("ArrowRight")}</button>`,
    "note",
    `RECOVERED MEMORY · ${number(f.stage + 1)} / 08`,
  );
  return true;
}
function showResonanceGuide(f, l) {
  const trial = RESONANCE_TRIALS[f.stage],
    state = restorePuzzle(l, f.stage, game.progress.resonance?.[f.stage]);
  modal(
    trial.title,
    `<div class="note-paper"><p>${trial.instruction}</p></div><p class="small-copy">The collars count from 0 to 11, then wrap. Walk to a crystal and press <kbd>E</kbd> (Use on touch) to turn up one mark. Hold Shift with E to turn down. The focused controls also offer both directions.</p><p class="small-copy">Each crystal sounds its stored voice beside your tuning. At unison, the second tone falls away and the two light rings settle together. Follow the engraved relations to play with sound muted.</p><div class="resonance-record">${trial.clues.map((_, i) => `<span>${resonanceClue(trial, i)}</span>`).join("")}</div><p class="small-copy">CURRENT MARKS · ${state.values.join(" / ")} · Every turn saves.</p><div class="pause-buttons"><button class="primary-button full-width" id="resonance-activate">Recover the memory ${icon("ArrowRight")}</button><button class="secondary-button" id="resonance-diagram">Inspect the tuning controls</button><button class="secondary-button" data-close>Return to the array</button><button class="text-button" id="resonance-reset">Reset the collars</button></div><p id="resonance-feedback" class="puzzle-feedback" role="status"></p>`,
    "note",
    `RESONANCE ARRAY · ${number(f.stage + 1)} / 08`,
  );
  document.querySelector("#resonance-diagram").onclick = () =>
    showPuzzle(f, l, true);
  document.querySelector("#resonance-reset").onclick = () => {
    game.setResonanceValues(f.stage, createPuzzle(l, f.stage));
    showResonanceGuide(f, l);
  };
  document.querySelector("#resonance-activate").onclick = () => {
    if (!activateResonance(f, l))
      document.querySelector("#resonance-feedback").textContent =
        "The voices have not settled. Match every engraved relation.";
  };
}
function showThermalGuide(f, l) {
  const trial = THERMAL_TRIALS[f.stage],
    state = restorePuzzle(l, f.stage, game.progress.thermal?.[f.stage]);
  const matched = state.effects.filter(
    (_, i) => !!(state.mask & (1 << i)) === !!(state.targetMask & (1 << i)),
  ).length;
  modal(
    trial.title,
    `<p class="modal-description">${l.objectiveNames[f.stage]}</p><div class="note-paper"><p>${trial.instruction}</p></div><p class="small-copy">Each chamber carries its row, column and required HEAT or COOL mark. Walk to a handwheel and press <kbd>E</kbd> (Use on touch). The linked shutters light up as you approach. Turning a valve reverses every shutter on that circuit; another turn reverses the same change.</p><p class="small-copy">Valve turns save immediately. Return to this record to activate the regulator when all ${state.effects.length} chambers match. ${matched} currently match.</p><div class="pause-buttons"><button class="primary-button full-width" id="thermal-activate">Activate the regulator ${icon("ArrowRight")}</button><button class="secondary-button" id="thermal-diagram">${icon("Flame")} Inspect the firing controls</button><button class="secondary-button" data-close>Return to the valves ${icon("ArrowRight")}</button><button class="text-button" id="thermal-reset">Reset the regulator</button></div><p id="thermal-feedback" class="puzzle-feedback" role="status"></p>`,
    "note",
    `THERMAL REGULATOR · ${number(f.stage + 1)} / 08`,
  );
  document.querySelector("#thermal-diagram").onclick = () =>
    showPuzzle(f, l, true);
  document.querySelector("#thermal-activate").onclick = () => {
    if (isSolved(restorePuzzle(l, f.stage, game.progress.thermal?.[f.stage]))) {
      closeModal(false);
      game.solve(f);
    } else
      document.querySelector("#thermal-feedback").textContent =
        "The firing pattern does not match yet. Check each chamber’s HEAT / COOL mark.";
  };
  document.querySelector("#thermal-reset").onclick = () => {
    game.setThermalValues(f.stage, createPuzzle(l, f.stage));
    showThermalGuide(f, l);
  };
}
function showWindGuide(f, l) {
  const trial = WIND_TRIALS[f.stage],
    state = restorePuzzle(l, f.stage, game.progress.wind?.[f.stage]);
  modal(
    trial.title,
    `<div class="note-paper"><p>${trial.instruction}</p></div><p class="small-copy">Walk to a numbered handwheel and press <kbd>E</kbd> (Use on touch) to rotate its duct clockwise. Straight castings stay straight; elbows stay elbows. Braced castings cannot turn. The silver stream shows where air reaches; both neighboring mouths must face each other.</p><p class="small-copy">Air enters A1 from the west. The receiver is beside <strong>${windName(state, state.end)}</strong> on the east. Its turbine turns when the circuit connects. Every rotation saves. Return here to activate the engine or inspect the same channels from above.</p><div class="pause-buttons"><button class="primary-button full-width" id="wind-activate">Activate the wind engine ${icon("ArrowRight")}</button><button class="secondary-button" id="wind-diagram">Inspect the channel controls</button><button class="secondary-button" data-close>Return to the court</button><button class="text-button" id="wind-reset">Reset the bearings</button></div><p id="wind-feedback" class="puzzle-feedback" role="status"></p>`,
    "puzzle",
    "THE WINDWARD CITY · ENGINE RECORD",
  );
  document.querySelector("#wind-diagram").onclick = () =>
    showPuzzle(f, l, true);
  document.querySelector("#wind-reset").onclick = () => {
    game.setWindValues(f.stage, createPuzzle(l, f.stage));
    showWindGuide(f, l);
  };
  document.querySelector("#wind-activate").onclick = () => {
    if (isSolved(restorePuzzle(l, f.stage, game.progress.wind?.[f.stage]))) {
      closeModal(false);
      game.solve(f);
    } else
      document.querySelector("#wind-feedback").textContent =
        "Air has not reached the receiver. Follow the silver stream to its first break.";
  };
}
function showCipherGuide(f, l) {
  const trial = CIPHER_TRIALS[f.stage],
    state = restorePuzzle(l, f.stage, game.progress.cipher?.[f.stage]);
  modal(
    trial.title,
    `<div class="note-paper"><p>${trial.instruction}</p></div><p class="small-copy">Read the sign facing the handwheel. Press <kbd>E</kbd> (Use on touch) to turn a drum forward. Hold Shift with E to turn backward. The cycle is SUN → ROOT → RAIN → MOON → SUN.</p><div class="covenant-clues">${trial.clues.map((c) => `<p>${cipherClue(c)}</p>`).join("")}</div><p class="small-copy">${state.values.map((v, i) => `${cipherName(i)}: ${l.symbols[v]}`).join(" · ")}<br>Every turn saves.</p><div class="pause-buttons"><button class="primary-button full-width" id="cipher-activate">Activate the sun gate ${icon("ArrowRight")}</button><button class="secondary-button" id="cipher-diagram">Inspect the carved drums</button><button class="secondary-button" data-close>Return to the court</button><button class="text-button" id="cipher-reset">Reset the drums</button></div><p id="cipher-feedback" class="puzzle-feedback" role="status"></p>`,
    "puzzle",
    `KEEPER'S COVENANT · ${number(f.stage + 1)} / ${number(l.mechanisms)}`,
  );
  document.querySelector("#cipher-diagram").onclick = () =>
    showPuzzle(f, l, true);
  document.querySelector("#cipher-reset").onclick = () => {
    game.setCipherValues(f.stage, createPuzzle(l, f.stage));
    showCipherGuide(f, l);
  };
  document.querySelector("#cipher-activate").onclick = () => {
    if (isSolved(restorePuzzle(l, f.stage, game.progress.cipher?.[f.stage]))) {
      closeModal(false);
      game.solve(f);
    } else
      document.querySelector("#cipher-feedback").textContent =
        "The signs do not yet satisfy every line of the covenant. Compare the drum numbers and the complete inscriptions.";
  };
}
function showPuzzle(f, l, diagram = false) {
  const type = PUZZLE_TYPES[l.biome];
  if (type === "cipher" && !diagram && game.cipherSites?.length)
    return showCipherGuide(f, l);
  if (type === "bridges" && !diagram && game.windSites?.length)
    return showWindGuide(f, l);
  if (type === "resonance" && !diagram && game.resonanceSites?.length)
    return showResonanceGuide(f, l);
  if (type === "forge" && !diagram && game.thermalSites?.length)
    return showThermalGuide(f, l);
  if (type === "sluices" && !diagram && game.hydraulicSites?.length)
    return showHydraulicGuide(f, l);
  if (type === "mirrors" && !diagram && game.solarSites?.length)
    return showSolarGuide(f, l);
  if (type === "echo" && !diagram && game.bellSites?.length)
    return showBellGuide(f, l);
  modal(
    type === "cipher"
      ? CIPHER_TRIALS[f.stage].title
      : type === "bridges"
        ? WIND_TRIALS[f.stage].title
        : type === "resonance"
          ? RESONANCE_TRIALS[f.stage].title
          : type === "forge"
            ? THERMAL_TRIALS[f.stage].title
            : PUZZLE_TITLES[type],
    `<p class="modal-description">${l.objectiveNames[f.stage]}</p><div id="puzzle-board"></div><p id="puzzle-feedback" class="puzzle-feedback" role="status">Study the mechanism. Every movement tells you something.</p><div class="puzzle-actions"><button class="text-button" id="puzzle-reset">${icon("RotateCcw")} Reset</button><button class="text-button" id="puzzle-hint">${icon("BookOpen")} Field hint</button><button class="primary-button" id="puzzle-submit">Activate ${icon("ArrowRight")}</button></div>`,
    "puzzle",
    `ANCIENT MECHANISM · ${number(f.stage + 1)} / ${number(l.mechanisms)}`,
  );
  mountedPuzzle = mountPuzzle(
    document.querySelector("#puzzle-board"),
    document.querySelector("#puzzle-feedback"),
    l,
    f.stage,
    audio,
    () => {
      if (type === "resonance") {
        activateResonance(f, l);
        return;
      }
      closeModal(false);
      game.solve(f);
    },
    type === "cipher"
      ? {
          resume: game.progress.cipher?.[f.stage],
          onChange: (state, event) =>
            game.setCipherValues(f.stage, state, event),
        }
      : type === "bridges"
        ? {
            resume: game.progress.wind?.[f.stage],
            onChange: (state, event) =>
              game.setWindValues(f.stage, state, event),
          }
        : type === "resonance"
          ? {
              resume: game.progress.resonance?.[f.stage],
              onChange: (state, event) =>
                game.setResonanceValues(f.stage, state, event),
            }
          : type === "forge"
            ? {
                resume: game.progress.thermal?.[f.stage],
                onChange: (state, event) =>
                  game.setThermalValues(f.stage, state, event),
              }
            : type === "orrery"
              ? {
                  resume: game.progress.alignments?.[f.stage],
                  onChange: (state) => {
                    game.progress.alignments ||= {};
                    game.progress.alignments[f.stage] = {
                      values: [...state.values],
                      moves: state.moves,
                    };
                    // Animate the instrument briefly while field simulation stays paused.
                    game.presentationRemaining = 1.2;
                    game.renderOnce = true;
                    game.save();
                  },
                }
              : type === "sluices"
                ? {
                    resume: game.progress.hydraulics?.[f.stage],
                    onChange: (state, event) =>
                      game.setHydraulicValues(f.stage, state, event),
                    canMove: () => !game.hydraulicSites?.[f.stage]?.flow,
                  }
                : type === "mirrors"
                  ? {
                      resume: game.progress.solar?.[f.stage],
                      onChange: (state) => game.setSolarValues(f.stage, state),
                    }
                  : type === "echo"
                    ? {
                        resume: game.progress.bells?.[f.stage],
                        onChange: (state) => game.setBellValues(f.stage, state),
                        onStrike: (note) => game.strikeBell(f.stage, note),
                        onPlayback: () => {
                          game.playBellPhrase(f.stage, { presentation: true });
                          return () => game.stopBellPhrase();
                        },
                      }
                    : {},
  );
  if (type === "cipher") {
    document
      .querySelector(".modal-backdrop")
      .classList.add("orrery-focus", "cipher-focus");
    game.cipherFocus = f.stage;
    game.renderOnce = true;
    game.updateCamera(1);
  }
  if (type === "bridges") {
    document
      .querySelector(".modal-backdrop")
      .classList.add("orrery-focus", "wind-focus");
    game.windFocus = f.stage;
    game.renderOnce = true;
    game.updateCamera(1);
  }
  if (type === "resonance") {
    document
      .querySelector(".modal-backdrop")
      .classList.add("orrery-focus", "resonance-focus");
    game.resonanceFocus = f.stage;
    game.renderOnce = true;
    game.updateCamera(1);
  }
  if (type === "forge") {
    document
      .querySelector(".modal-backdrop")
      .classList.add("orrery-focus", "thermal-focus");
    game.thermalFocus = f.stage;
    game.renderOnce = true;
    game.updateCamera(1);
  }
  if (type === "sluices") {
    document
      .querySelector(".modal-backdrop")
      .classList.add("orrery-focus", "hydraulic-focus");
    game.hydraulicFocus = f.stage;
    game.renderOnce = true;
    game.updateCamera(1);
  }
  if (type === "orrery") {
    document.querySelector(".modal-backdrop").classList.add("orrery-focus");
    game.orreryFocus = f.stage;
    game.updateCamera(1);
  }
  if (type === "echo") {
    document
      .querySelector(".modal-backdrop")
      .classList.add("orrery-focus", "bell-focus");
    game.bellFocus = f.stage;
    game.renderOnce = true;
    game.updateCamera(1);
  }
}
function showComplete(l, p) {
  const isFinal = store.total().completed === 8;
  modal(
    isFinal ? "The world remembers." : "A secret, unearthed.",
    `<div class="completion-relic">${icon("Gem")}</div><span class="eyebrow completion-artifact">${l.artifact}</span><p class="modal-description">${isFinal ? "Eight relics brought together. A lost world found. And somewhere beyond the last meridian, a familiar voice calls your name." : `You have uncovered the truth hidden within ${l.title}. Another piece of your mother’s journey is yours to carry.`}</p><div class="completion-stats"><div><strong>${formatTime(p.time)}</strong><span>Time in the field</span></div><div><strong>${game.state().notes} / 12</strong><span>Pages discovered</span></div><div><strong>${game.state().treasures} / 6</strong><span>Caches recovered</span></div></div><button class="primary-button full-width" id="next-expedition">${isFinal ? "Return to the expedition" : "Continue the journey"} ${icon("ArrowUpRight")}</button><button class="text-button centered" data-close>Keep exploring this chapter</button>`,
    "complete",
    `CHAPTER ${number(game.levelIndex + 1)} COMPLETE`,
  );
  document.querySelector("#next-expedition").onclick = () => {
    if (isFinal) {
      game.stop();
      inGame = false;
      closeModal();
      location.reload();
    } else startGame((game.levelIndex + 1) % 8);
  };
}
init();

if (import.meta.env.DEV)
  Object.defineProperty(window, "__vesper", {
    get: () => ({
      game,
      store,
      startGame,
      showPuzzle,
      closeModal,
      showMap,
      getPuzzle: () => mountedPuzzle?.getState(),
      audio,
      getStartup: () =>
        startup
          ? {
              index: startup.index,
              stage: document.querySelector("#loading-status").textContent,
            }
          : null,
    }),
  });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.pause();
  else if (game?.active) audio.resume();
});
