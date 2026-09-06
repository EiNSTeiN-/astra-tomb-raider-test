import {
  WIND_TRIALS,
  windLayout,
  windInput,
  traceWind,
  windSolution,
  windName,
  normalizeWind,
} from "./wind-rules.js";
import {
  RESONANCE_TRIALS,
  resonanceLayout,
  resonanceInput,
  resonanceSolution,
  resonanceClue,
  resonanceName,
  normalizeResonance,
} from "./resonance-rules.js";
import {
  THERMAL_TRIALS,
  thermalLayout,
  thermalInput,
  thermalSolution,
  normalizeThermal,
} from "./thermal-rules.js";
import {
  HYDRAULIC_TRIALS,
  hydraulicLayout,
  hydraulicStates,
  hydraulicInput,
  hydraulicMessage,
  normalizeHydraulics,
  transferWater,
} from "./hydraulic-rules.js";
import { random, SYMBOLS } from "./campaign.js";
import { solarLayout, traceSolar } from "./solar-rules.js";
import {
  bellCue,
  BELL_LESSONS,
  BELL_INTERVAL,
  BELL_LEAD,
  BELL_PHRASES,
  bellAnswer,
  normalizeBells,
} from "./bell-rules.js";

export const PUZZLE_TYPES = {
  jungle: "cipher",
  desert: "mirrors",
  snow: "echo",
  water: "sluices",
  volcano: "forge",
  sky: "bridges",
  crystal: "resonance",
  eclipse: "orrery",
};
export const PUZZLE_TITLES = {
  cipher: "The keeper’s covenant",
  mirrors: "A path for the sun",
  echo: "The bells remember",
  sluices: "A kingdom in balance",
  forge: "The sleeping furnace",
  bridges: "The windward crossing",
  resonance: "The frequency of memory",
  orrery: "The last alignment",
};
const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export function toggleLights(mask, index) {
  let next = mask;
  const x = index % 4,
    y = Math.floor(index / 4);
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx,
      ny = y + dy;
    if (nx >= 0 && nx < 4 && ny >= 0 && ny < 4) next ^= 1 << (ny * 4 + nx);
  }
  return next;
}
export const pour = transferWater;
export function jugStates() {
  return hydraulicStates(HYDRAULIC_TRIALS[0]);
}

export function createPuzzle(level, stage) {
  const rng = random(level.seed + stage * 1987),
    type = PUZZLE_TYPES[level.biome],
    state = { type, stage, moves: 0, seed: level.seed + stage * 1987 };
  if (type === "cipher") {
    state.target = Array.from({ length: 4 }, () => Math.floor(rng() * 4));
    if (state.target.every((v) => !v)) state.target[0] = 1;
    state.values = [0, 0, 0, 0];
    state.relations = state.target.map(
      (v, i) => (v - (i ? state.target[i - 1] : 0) + 4) % 4,
    );
  }
  if (type === "mirrors") {
    Object.assign(state, solarLayout(stage));
    state.values = state.target.map((v, i) =>
      i === 0 ? 1 - v : Math.floor(rng() * 2),
    );
  }
  if (type === "echo") {
    state.target = bellAnswer(BELL_PHRASES[stage], stage);
    state.values = [];
    state.playing = false;
    state.active = -1;
    state.heard = false;
  }
  if (type === "sluices") Object.assign(state, hydraulicLayout(stage));
  if (type === "forge") Object.assign(state, thermalLayout(stage));
  if (type === "bridges") Object.assign(state, windLayout(stage));
  if (type === "resonance") Object.assign(state, resonanceLayout(stage));
  if (type === "orrery") {
    state.values = [0, 0, 0];
    state.target = [0, 0, 0];
    state.solution = Array.from({ length: 3 }, () => 1 + Math.floor(rng() * 5));
    for (let i = 0; i < 3; i++)
      for (let n = 0; n < state.solution[i]; n++) {
        state.target[i] = (state.target[i] + 1) % 8;
        state.target[(i + 1) % 3] = (state.target[(i + 1) % 3] + 2) % 8;
      }
  }
  return state;
}
export function beamPath(state) {
  return traceSolar(state);
}
export const bridgeConnected = (state) => traceWind(state).hit;
export function isSolved(s) {
  if (s.type === "forge") return s.mask === s.targetMask;
  if (s.type === "mirrors") return beamPath(s).hit;
  if (s.type === "bridges") return bridgeConnected(s);
  return equal(s.values, s.target);
}
export function applyMove(s, action) {
  if (s.type === "sluices") return hydraulicInput(s, action.index);
  if (s.type === "forge") return thermalInput(s, action.index);
  if (s.type === "resonance")
    return resonanceInput(s, action.index, action.delta ?? 1);
  if (s.type === "bridges") return windInput(s, action.index);
  s.moves++;
  const i = action.index;
  if (s.type === "cipher") s.values[i] = (s.values[i] + 1) % 4;
  if (s.type === "mirrors") s.values[i] = 1 - s.values[i];
  if (s.type === "echo" && !s.playing) {
    if (s.values.length < s.target.length) s.values.push(i);
  }

  if (s.type === "orrery") {
    s.values[i] = (s.values[i] + 1) % 8;
    s.values[(i + 1) % 3] = (s.values[(i + 1) % 3] + 2) % 8;
  }
}
export function hint(s, l) {
  const symbol = (n) => l.symbols[n];
  switch (s.type) {
    case "cipher":
      return `The first ring is ${symbol(s.target[0])}. Each remaining ring advances from the previous one through this cycle: ${l.symbols.join(" → ")} → ${l.symbols[0]}.`;
    case "mirrors": {
      const i = s.values.findIndex((v, i) => v !== s.target[i]);
      return i < 0
        ? "The sunlight reaches the receiver. Activate the mechanism."
        : `Turn the mirror at row ${s.mirrors[i].y + 1}, column ${s.mirrors[i].x + 1}. Follow the beam’s next turn.`;
    }
    case "echo":
      return `${BELL_LESSONS[s.stage].instruction} Your answer begins ${s.target.slice(0, 3).map(symbol).join(" → ")}.`;
    case "sluices": {
      const route = hydraulicStates(s, s.values).find((v) =>
        equal(v.value, s.target),
      )?.route;
      if (!route?.length)
        return isSolved(s)
          ? "The royal measure is balanced. Activate the pressure receiver."
          : "Reset the court to recover its original supply.";
      const [a, b] = route[0];
      return `Pump cistern ${["I", "II", "III"][a]} into ${["I", "II", "III"][b]}. ${route.length} transfers remain on a shortest route.`;
    }
    case "forge": {
      const plan = thermalSolution(s.stage, s.mask);
      return plan?.length
        ? `Turn valve ${String.fromCharCode(65 + Math.floor(plan[0] / s.columns))}${(plan[0] % s.columns) + 1}. ${plan.length} turns remain on a shortest route to the engraved heat pattern.`
        : "The firing pattern is correct. Activate the regulator.";
    }
    case "bridges": {
      const plan = windSolution(s);
      return plan.length
        ? `Turn duct ${windName(s, plan[0])} clockwise. Follow the moving air; braced ducts cannot turn.`
        : "The wind reaches the receiver. Activate the engine at its record.";
    }
    case "resonance": {
      const plan = resonanceSolution(s),
        move = plan[0];
      return move
        ? `Turn ${resonanceName(move.index)} ${move.delta > 0 ? "up" : "down"} one mark. ${plan.length} turns remain on a shortest route. Marks wrap between 11 and 0.`
        : "The array holds one voice. Recover its memory.";
    }
    case "orrery": {
      for (let a = 0; a < 8; a++)
        for (let b = 0; b < 8; b++)
          for (let c = 0; c < 8; c++) {
            if (
              equal(
                [
                  (s.values[0] + a + 2 * c) % 8,
                  (s.values[1] + b + 2 * a) % 8,
                  (s.values[2] + c + 2 * b) % 8,
                ],
                s.target,
              )
            )
              return `From here, turn Earth ${a} time${a === 1 ? "" : "s"}, Sun ${b}, and Moon ${c}. The rings influence their neighbor clockwise.`;
          }
      return "Each ring moves itself one step and its neighbor two steps.";
    }
  }
}

export function restorePuzzle(level, stage, saved) {
  const state = createPuzzle(level, stage);
  if (state.type === "forge") {
    const value = normalizeThermal({ [stage]: saved })[stage];
    if (value)
      Object.assign(state, value, {
        solution: thermalSolution(stage, value.mask),
      });
  }
  if (state.type === "sluices") {
    const value = normalizeHydraulics({ [stage]: saved })[stage];
    if (value) Object.assign(state, value);
  }
  if (state.type === "bridges") {
    const value = normalizeWind({ [stage]: saved })[stage];
    if (value) Object.assign(state, value);
  }
  if (state.type === "resonance") {
    const value = normalizeResonance({ [stage]: saved })[stage];
    if (value) Object.assign(state, value);
  }
  if (state.type === "echo") {
    const value = normalizeBells({ [stage]: saved })[stage];
    if (value) Object.assign(state, value);
  }
  if (
    ["orrery", "mirrors"].includes(state.type) &&
    Array.isArray(saved?.values) &&
    saved.values.length === state.values.length &&
    saved.values.every(
      (v) =>
        Number.isInteger(v) && v >= 0 && v < (state.type === "mirrors" ? 2 : 8),
    )
  ) {
    state.values = [...saved.values];
    state.moves = Number.isInteger(saved.moves)
      ? Math.max(0, Math.min(100000, saved.moves))
      : 0;
  }
  return state;
}

export function mountPuzzle(
  board,
  feedback,
  level,
  stage,
  audio,
  onSolved,
  options = {},
) {
  let state = restorePuzzle(level, stage, options.resume),
    timers = [],
    stopPlayback = null,
    disposed = false;
  const type = state.type;
  const sym = (n) => SYMBOLS[level.symbols[n]] || "◇";
  const reset = () => {
    stopPlayback?.();
    stopPlayback = null;
    timers.forEach(clearTimeout);
    timers = [];
    state = createPuzzle(level, stage);
    options.onChange?.(state);
    feedback.classList.remove("incorrect");
    feedback.textContent = "The mechanism returns to rest.";
    render();
  };
  const describe = {
    cipher:
      "The first sign is named. Each subsequent ring advances through the cycle by its engraved count.",
    mirrors:
      "Rotate the mirrors to guide sunlight from the left emitter to the right receiver.",
    echo: BELL_LESSONS[stage]?.instruction,
    sluices: `${HYDRAULIC_TRIALS[stage]?.instruction} Select a source, then a receiver. Pumping stops when the source is empty or the receiver is full.`,
    forge: THERMAL_TRIALS[stage]?.instruction,
    bridges: `${WIND_TRIALS[stage]?.instruction} Turn each bearing clockwise. Braced ducts stay fixed.`,
    resonance: `${RESONANCE_TRIALS[stage]?.instruction} Marks run from 0 to 11, then wrap.`,
    orrery:
      "Align all three rings with the celestial record. Turning one ring also advances its next neighbor two steps.",
  };
  const move = (index, delta) => {
    if (options.canMove?.() === false) {
      feedback.textContent = "Let the pump finish this transfer.";
      return;
    }
    if (
      type === "echo" &&
      (state.playing || state.values.length >= state.target.length)
    )
      return;
    const event = applyMove(state, { index, delta });
    options.onChange?.(state, event);
    if (type === "sluices") {
      feedback.classList.remove("incorrect");
      feedback.textContent = hydraulicMessage(event);
    }
    if (type === "forge") {
      feedback.classList.remove("incorrect");
      feedback.textContent =
        event.kind === "changed"
          ? `${event.affected.length} linked shutters changed. Match every engraved HEAT / COOL mark.`
          : "Choose one of the marked valves.";
    }
    if (type === "echo") {
      if (options.onStrike) options.onStrike(index);
      else audio.note?.([261.63, 329.63, 392, 523.25][index]);
    } else if (!["sluices", "forge", "resonance", "bridges"].includes(type))
      audio.tone();
    render();
  };
  function render() {
    if (disposed) return;
    let html = `<p class="mechanism-instructions">${describe[type]}</p>`;
    if (type === "cipher") {
      html += `<div class="rune-cycle">${level.symbols.map((name, i) => `<span>${sym(i)} <small>${name}</small></span>`).join("<b>→</b>")}</div><div class="cipher-clue">First: <b>${level.symbols[state.target[0]]}</b><span>Then advance: ${state.relations
        .slice(1)
        .map((n) => `+${n}`)
        .join(
          " / ",
        )}</span></div><div class="cipher-rings">${state.values.map((v, i) => `<button class="cipher-ring" data-move="${i}" aria-label="Rotate ring ${i + 1}: ${level.symbols[v]}"><span class="ring-number">${String(i + 1).padStart(2, "0")}</span><b>${sym(v)}</b><span>${level.symbols[v]}</span><span>↻</span></button>`).join("")}</div>`;
    }
    if (type === "mirrors") {
      const beam = beamPath(state),
        lines = beam.points
          .map((p) => `${(p.x + 0.5) * 50},${(p.y + 0.5) * 50}`)
          .join(" ");
      html += `<div class="laser-board"><svg viewBox="-30 -5 360 310" aria-label="Sunlight route"><defs><pattern id="laser-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#c6b77d22"/></pattern></defs><rect width="300" height="300" fill="url(#laser-grid)"/><polyline points="${lines}" fill="none" stroke="#f4c672" stroke-width="2.5"/><circle cx="-15" cy="${(state.start.y + 0.5) * 50}" r="7" fill="#ecc77a"/><rect x="304" y="${state.end.y * 50 + 12}" width="14" height="26" fill="${beam.hit ? "#a9d2a0" : "#6b775e"}"/>${state.mirrors.map((m, i) => `<g data-move="${i}" tabindex="0" role="button" aria-label="Rotate mirror row ${m.y + 1} column ${m.x + 1}" transform="translate(${m.x * 50},${m.y * 50})"><rect x="4" y="4" width="42" height="42" rx="4" fill="#273b2d" stroke="#d4b47c"/><path d="${state.values[i] ? "M13 13L37 37" : "M13 37L37 13"}" stroke="#ebe4c1" stroke-width="3"/></g>`).join("")}</svg></div>`;
    }
    if (type === "echo") {
      html += `<button class="secondary-button full-width" id="play-echo" ${state.playing ? "disabled" : ""}>${state.playing ? "Listen…" : "♫ Listen to the bells"}</button><div class="sequence-slots">${state.target.map((_, i) => `<span class="${state.values[i] !== undefined ? "filled" : ""}">${state.values[i] === undefined ? "·" : sym(state.values[i])}</span>`).join("")}</div><div class="sequence-buttons">${level.symbols.map((name, i) => `<button class="symbol-button ${state.active === i ? "sounding" : ""}" data-move="${i}" ${state.playing ? "disabled" : ""} aria-label="Ring ${name}"><b>${sym(i)}</b><span>${name}</span></button>`).join("")}</div>`;
    }
    if (type === "sluices") {
      const names = ["I", "II", "III"];
      const routes = [
        [0, 1],
        [1, 2],
        [0, 2],
      ].map(([a, b]) => {
        const forward = state.links.some(([x, y]) => x === a && y === b),
          reverse = state.links.some(([x, y]) => x === b && y === a);
        return `${names[forward ? a : b]} ${forward && reverse ? "↔" : "→"} ${names[forward ? b : a]}`;
      });
      html += `<div class="cipher-clue">The royal measure <b>${state.target.join(" · ")} units</b><span class="hydraulic-routes">${routes.join("　 ·　 ")}</span></div><div class="channel-grid">${state.values.map((v, i) => `<button class="channel ${state.selected === i ? "pour-selected" : ""}" data-move="${i}" aria-label="Cistern ${names[i]}: ${v} of ${state.capacity[i]} units, target ${state.target[i]}" aria-pressed="${state.selected === i}"><span class="eyebrow">CISTERN ${names[i]}</span><div class="vessel"><div style="height:${(v / state.capacity[i]) * 100}%"></div><i class="water-target-line" style="bottom:${(state.target[i] / state.capacity[i]) * 100}%"></i><span>${v} / ${state.capacity[i]}</span></div><span class="vessel-target">TARGET ${state.target[i]}</span></button>`).join("")}</div>`;
    }
    if (type === "forge")
      html += `<p class="thermal-key">✦ HEAT　◇ COOL · Match the mark below each chamber.</p><div class="forge-grid thermal-grid" style="--thermal-columns:${state.columns}">${Array.from(
        { length: state.effects.length },
        (_, i) => {
          const hot = !!(state.mask & (1 << i)),
            target = !!(state.targetMask & (1 << i)),
            name =
              String.fromCharCode(65 + Math.floor(i / state.columns)) +
              ((i % state.columns) + 1),
            marked =
              state.last !== null && !!(state.effects[state.last] & (1 << i));
          return `<button class="forge-vent ${hot ? "hot" : ""} ${marked ? "thermal-marked" : ""}" data-move="${i}" aria-label="Valve ${name}: ${hot ? "hot" : "cool"}, target ${target ? "heat" : "cool"}" aria-pressed="${hot}"><small>${name}</small><span>${hot ? "✦" : "◇"}</span><b>${target ? "HEAT" : "COOL"}</b></button>`;
        },
      ).join("")}</div>`;
    if (type === "bridges") {
      const flow = traceWind(state);
      html += `<div class="bridge-labels"><span>→ IN · A1</span><span>OUT · ${windName(state, state.end)} →</span></div><div class="pipe-grid wind-grid" style="--wind-columns:${state.columns}">${state.values
        .map(
          (mask, i) =>
            `<button class="pipe-tile ${flow.cells.includes(i) ? "wind-fed" : ""}" data-move="${i}" ${state.fixed.includes(i) ? "disabled" : ""} aria-label="${state.fixed.includes(i) ? "Fixed" : "Rotate"} duct ${windName(state, i)}, ports ${[
              [1, "north"],
              [2, "east"],
              [4, "south"],
              [8, "west"],
            ]
              .filter(([p]) => mask & p)
              .map(([, n]) => n)
              .join(
                " and ",
              )}${flow.cells.includes(i) ? ", air flowing" : ""}"><small>${windName(state, i)}${state.fixed.includes(i) ? " · FIXED" : ""}</small><svg viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="5" fill="currentColor"/>${[
              [1, 25, 0],
              [2, 50, 25],
              [4, 25, 50],
              [8, 0, 25],
            ]
              .filter(([dir]) => mask & dir)
              .map(
                ([, x, y]) =>
                  `<path d="M25 25L${x} ${y}" stroke="currentColor" stroke-width="6" fill="none"/>`,
              )
              .join("")}</svg></button>`,
        )
        .join("")}</div>`;
    }
    if (type === "resonance")
      html += `<div class="resonance-grid resonance-controls">${state.values.map((v, i) => `<div class="resonator ${v === state.target[i] ? "in-unison" : ""}"><div class="resonance-stone"><span class="eyebrow">CRYSTAL ${resonanceName(i)}</span><b aria-hidden="true">◈</b></div><span class="resonator-equation">${resonanceClue(RESONANCE_TRIALS[stage], i)}</span><div class="resonance-dial"><button data-move="${i}" data-delta="-1" aria-label="Lower crystal ${resonanceName(i)} mark">−</button><b aria-label="Crystal ${resonanceName(i)} mark ${v}">${v}</b><button data-move="${i}" aria-label="Raise crystal ${resonanceName(i)} mark">+</button></div><small>${v === state.target[i] ? "IN UNISON" : "TWO VOICES"}</small></div>`).join("")}</div>`;
    if (type === "orrery")
      html += `<div class="cipher-clue">Celestial record <b>${state.target.join(" · ")}</b><span>Positions count from 0 to 7.</span></div><div class="orrery-grid">${state.values.map((v, i) => `<button class="orrery-ring" data-move="${i}" aria-label="Turn ${["Earth", "Sun", "Moon"][i]} ring, position ${v}"><span>${["EARTH", "SUN", "MOON"][i]}</span><div class="orrery-orbit"><i style="transform:rotate(${v * 45}deg)"></i><b>${v}</b></div><small>↻ +1 here / +2 next</small></button>`).join("")}</div>`;
    html += `<div class="puzzle-state-row"><span>${state.moves} ${type === "sluices" ? "TRANSFERS" : "MOVES"}</span><span>${isSolved(state) ? "◇ MECHANISM ALIGNED" : "◇ AWAITING ALIGNMENT"}</span></div>`;
    board.innerHTML = html;
    board.querySelectorAll("[data-move]").forEach((b) => {
      b.onclick = () =>
        move(Number(b.dataset.move), Number(b.dataset.delta) || 1);
      if (b.tagName.toLowerCase() === "g")
        b.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            b.onclick();
          }
        };
    });
    const play = board.querySelector("#play-echo");
    if (play)
      play.onclick = () => {
        state.playing = true;
        state.heard = true;
        options.onChange?.(state);
        stopPlayback = options.onPlayback?.();
        render();
        bellCue(state.target, state.stage).forEach((note, i) => {
          timers.push(
            setTimeout(
              () => {
                if (disposed) return;
                state.active = note;
                if (!stopPlayback) {
                  if (options.onStrike) options.onStrike(note);
                  else audio.note?.([261.63, 329.63, 392, 523.25][note]);
                }
                render();
              },
              (i * BELL_INTERVAL + BELL_LEAD) * 1000,
            ),
          );
          timers.push(
            setTimeout(
              () => {
                if (disposed) return;
                state.active = -1;
                render();
              },
              (i * BELL_INTERVAL + BELL_LEAD + 0.7) * 1000,
            ),
          );
        });
        timers.push(
          setTimeout(
            () => {
              if (disposed) return;
              state.playing = false;
              state.active = -1;
              feedback.textContent = BELL_LESSONS[state.stage].instruction;
              render();
            },
            (state.target.length * BELL_INTERVAL + BELL_LEAD) * 1000,
          ),
        );
      };
  }
  render();
  document.querySelector("#puzzle-reset").onclick = reset;
  document.querySelector("#puzzle-hint").onclick = () => {
    feedback.textContent = hint(state, level);
    feedback.classList.remove("incorrect");
  };
  document.querySelector("#puzzle-submit").onclick = () => {
    if (options.canMove?.() === false) {
      feedback.textContent =
        "Let the pump finish this transfer before activating the receiver.";
      return;
    }
    if (isSolved(state)) {
      timers.forEach(clearTimeout);
      onSolved();
    } else {
      feedback.textContent =
        "The mechanism is not aligned yet. Study its behavior, or ask for a field hint.";
      feedback.classList.add("incorrect");
      audio.tone("hurt");
    }
  };
  return {
    dispose() {
      stopPlayback?.();
      stopPlayback = null;
      disposed = true;
      timers.forEach(clearTimeout);
    },
    getState: () => state,
  };
}
