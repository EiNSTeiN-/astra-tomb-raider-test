import { buildStationYards } from "./station-yards.js";
import { arrivalCamera } from "./camera-arrival.js";
import { normalizeCamera } from "./camera-state.js";
import {
  buildDesertSurvey,
  updateDesertSurvey,
  controlSurveyScope,
  frameSurveyScope,
  leaveSurveyScope,
  surveyInteract,
  surveyHint,
  surveyObjective,
} from "./desert-survey.js";
import {
  surveyBlocked,
  surveyOccludes,
  surveySavePosition,
  restoreSurveyArrival,
} from "./desert-survey-rules.js";
import {
  buildArcadeLock,
  updateArcadeLock,
  advanceArcadeTurn,
  arcadeInteract,
  arcadeHint,
  arcadeObjective,
  tryArcadeClimb,
} from "./arcade-lock.js";
import {
  arcadeBlocked,
  arcadeOccludes,
  arcadeSavePosition,
  restoreArcadeArrival,
} from "./arcade-lock-rules.js";
import {
  buildSunBridge,
  updateSunBridge,
  advanceSunTurn,
  sunInteract,
  sunHint,
  sunObjective,
  recoverSunFall,
} from "./sun-bridge.js";
import {
  sunBlocked,
  sunOccludes,
  sunSavePosition,
  restoreSunArrival,
} from "./sun-bridge-rules.js";
import {
  buildShutterHouse,
  updateShutterHouse,
  shutterHint,
  shutterObjective,
} from "./shutter-house.js";
import { advanceShutterTurn } from "./shutter-motion.js";
import {
  shutterBlocked,
  shutterOccludes,
  shutterWindVelocity,
  shutterSavePosition,
  restoreShutterArrival,
} from "./shutter-house-rules.js";
import {
  buildEchoCauseway,
  updateEchoCauseway,
  recoverCausewayFall,
  causewayInteract,
  causewayHint,
  causewayObjective,
} from "./echo-causeway.js";
import {
  causewayBlocked,
  causewayOccludes,
  causewaySavePosition,
  restoreCausewayArrival,
} from "./echo-causeway-rules.js";
import {
  buildAstralCrane,
  updateAstralCrane,
  controlAstralCrane,
  poseAstralCrane,
  craneInteract,
  craneHint,
  craneObjective,
} from "./astral-crane.js";
import { craneBlocked, craneOccludes } from "./astral-crane-rules.js";
import {
  buildTemperingCart,
  updateTemperingCart,
  updateCartArt,
  controlTemperingCart,
  poseTemperingCart,
  interactTemperingCart,
  cartHint,
} from "./tempering-cart.js";
import {
  cartBlocked,
  cartOccludes,
  cartSavePosition,
} from "./tempering-cart-rules.js";
import {
  buildRainGarden,
  updateRainGarden,
  gardenHint,
  gardenInteract,
} from "./rain-garden.js";
import {
  gardenBlocked,
  gardenOccludes,
  gardenSavePosition,
} from "./rain-garden-rules.js";
import {
  buildEasternReflector,
  updateEasternReflector,
  reflectorHint,
  reflectorInteract,
  reflectorObjective,
} from "./eastern-reflector.js";
import {
  reflectorBlocked,
  reflectorOccludes,
} from "./eastern-reflector-rules.js";
import {
  buildCoralPump,
  updateCoralPump,
  coralPumpInteract,
  coralPumpHint,
  coralPumpObjective,
  coralPumpBlocked,
  coralPumpOccludes,
} from "./coral-pump.js";
import {
  buildFrozenStair,
  updateFrozenStair,
  frozenStairHint,
  frozenStairInteract,
  frozenStairObjective,
} from "./frozen-stair.js";
import {
  frozenStairBlocked,
  frozenStairOccludes,
} from "./frozen-stair-rules.js";
import {
  buildCourierFerry,
  updateCourierFerry,
  updateCourierArt,
  controlCourier,
  poseCourier,
  interactCourier,
  courierHint,
  courierObjective,
  recoverCourierFall,
  courierOccludes,
} from "./courier-ferry.js";
import {
  courierCorridor,
  courierBlocked,
  courierSavePosition,
  restoreCourierArrival,
} from "./courier-rules.js";
import { buildCamp, updateCamps } from "./camps.js";
import { buildBrazier, finishBraziers, updateBraziers } from "./braziers.js";
import { disposeBirdTemplates } from "./birds.js";
import {
  buildPressureRelay,
  updatePressureRelay,
  pressureInteract,
  pressureHint,
  pressureObjective,
} from "./pressure-relay.js";
import {
  pressureBlocked,
  pressureOccludes,
  pressureSavePosition,
  restorePressureArrival,
} from "./pressure-rules.js";
import { buildSurveyorsCleft, updateCleftArt } from "./cleft-art.js";
import { frameCleftCamera } from "./cleft-camera.js";
import { cleftBlocked, cleftOccludes } from "./cleft-rules.js";
import {
  updateCleft,
  cleftInteract,
  cleftHint,
  cleftObjective,
  cleftSavePosition,
} from "./cleft.js";
import {
  buildBellHoist,
  updateBellHoist,
  bellHoistInteract,
  bellHoistHint,
  bellHoistObjective,
} from "./bell-hoist.js";
import {
  hoistBlocked,
  hoistSavePosition,
  hoistOccludes,
} from "./bell-hoist-rules.js";
import { disposeInstanceBuffers } from "./instance-lod.js";
import {
  canAim,
  aimShoulder,
  clearAim,
  setAim,
  updateAim,
  sightline,
  aimedShot,
  aimState,
  addShotTrace,
  updateShotTraces,
} from "./aiming.js";
import { silenceCableMotion } from "./return-cable.js";
import {
  buildCipherCourts,
  updateCipherCourts,
  cipherReady,
  cipherInteract,
  cipherTarget,
  saveCipherState,
  settleCipher,
  focusCipher,
} from "./cipher-courts.js";
import {
  buildWindCourts,
  updateWindCourts,
  windReady,
  windInteract,
  windTarget,
  saveWindState,
  settleWind,
  focusWind,
} from "./wind-courts.js";
import {
  buildResonanceCourts,
  updateResonanceCourts,
  resonanceReady,
  resonanceInteract,
  resonanceTarget,
  saveResonanceState,
  settleResonance,
  focusResonance,
} from "./resonance-courts.js";
import {
  buildThermalCourts,
  updateThermalCourts,
  thermalReady,
  thermalInteract,
  thermalTarget,
  saveThermalState,
  settleThermal,
  focusThermal,
} from "./thermal-courts.js";
import {
  buildHydraulicCourts,
  updateHydraulicCourts,
  hydraulicInteract,
  hydraulicReady,
  hydraulicTarget,
  saveHydraulicState,
  focusHydraulics,
  settleHydraulics,
} from "./hydraulic-courts.js";
import * as THREE from "three";
import { updateSunBridgeDepth } from "./sun-bridge-depth.js";
import { updateSkyGusts, skyWindVelocity } from "./sky-gusts.js";
import {
  buildOrbitVault,
  updateOrbitVault,
  recoverOrbitFall,
  orbitBlocked,
  orbitOccludes,
  orbitInteract,
  orbitHint,
  orbitObjective,
} from "./orbit-vault.js";
import { orbitSavePosition, restoreOrbitArrival } from "./orbit-rules.js";
import {
  buildEchoGallery,
  updateEchoGallery,
  echoBlocked,
  echoOccludes,
  echoInteract,
  echoHint,
  echoObjective,
} from "./echo-gallery.js";
import {
  buildBellCourts,
  updateBellCourts,
  bellInteract,
  bellReady,
  bellTarget,
  saveBellState,
  playBellPhrase,
  strikeBell,
  cancelBellPlayback,
  focusBells,
} from "./bell-courts.js";
import {
  buildSolarChambers,
  updateSolarChambers,
  solarInteract,
  solarTarget,
  solarReady,
  saveSolarState,
} from "./solar-chambers.js";
import {
  buildObservatory,
  updateObservatory,
  focusObservatory,
} from "./observatory.js";
import {
  buildTorch,
  useTorch,
  updateTorch,
  torchHint,
  extinguishTorch,
} from "./torch.js";
import { loadMemorialArt } from "./memorial-art.js";
import {
  buildFireVault,
  updateFireVault,
  fireVaultHint,
  fireVaultInteract,
  fireVaultObjective,
} from "./fire-vault.js";
import { vaultBridgeBlocked } from "./fire-vault-rules.js";
import { advanceCausewayWheel } from "./fire-vault-motion.js";
import { advancePressureOperation } from "./pressure-motion.js";
import { advanceOrbitBearing } from "./orbit-motion.js";
import { buildCaverns, updateCaverns } from "./caverns.js";
import { cavernClear } from "./cavern-profile.js";
import { galleryAt, galleryClear } from "./sunken-gallery-layout.js";
import {
  buildSunkenGallery,
  updateSunkenGallery,
  galleryHint,
  galleryInteract,
  galleryObjective,
  restoreGalleryArrival,
  captureGallery,
} from "./sunken-gallery.js";
import { migrateSkyRoute } from "./sky-layout.js";
import { buildSkyArchitecture } from "./sky-architecture.js";
import {
  buildSkyBridges,
  updateSkyBridges,
  recoverSkyBridgeFall,
  restoreSkyBridgeArrival,
  skyBridgeHint,
} from "./sky-bridges.js";
import { skySpanCorridor, skyBridgeBlocked } from "./sky-bridge-rules.js";
import {
  buildForgeArchitecture,
  updateForgeArchitecture,
} from "./forge-architecture.js";
import {
  buildPalaceArchitecture,
  updatePalaceArchitecture,
} from "./palace-architecture.js";
import { weatherPalaceStone } from "./palace-material.js";
import {
  buildDesertArchitecture,
  updateDesertArchitecture,
  weatherDesertStone,
} from "./desert-architecture.js";
import { buildDesertPalms, updateDesertPalms } from "./desert-palms.js";
import {
  buildMonasteryArchitecture,
  updateMonasteryArchitecture,
} from "./monastery-architecture.js";
import {
  buildCounterweights,
  hasCounterweights,
  counterweightsReady,
  counterweightHint,
  counterweightInteract,
  updateCounterweightGrip,
  syncCounterweights,
  poseCounterweight,
  resetCounterweights,
} from "./counterweights.js";
import {
  buildWaterSurfaces,
  updateWaterSurfaces,
  waterSplash,
} from "./water-surface.js";
import {
  advanceSwimming,
  restoreWaterArrival,
  wadingDepth,
} from "./water-motion.js";
import { waterAt, hotLavaAt } from "./hydrology.js";
import {
  stationBlocked,
  stationEntry,
  stationMantleEnd,
} from "./field-station-solids.js";
import { prepareGuardianPatrols } from "./guardian-patrols.js";
import { resetDiving, divingHint, updateDiveView, DIVE_AIR } from "./diving.js";
import {
  buildTideArchive,
  updateTideArchive,
  archiveInteract,
  archiveHint,
  archiveProgress,
} from "./tide-archive.js";
import {
  buildTempleArchitecture,
  updateTempleArchitecture,
} from "./temple-architecture.js";
import { advanceCharacter, safeArrival } from "./character-motion.js";
import {
  resetTraversal,
  restoreTraversal,
  captureTraversal,
  trackTraversalSupport,
  updateTraversal,
  traversalInteract,
  traversalHint,
  traversalTarget,
} from "./traversal.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createMap, random } from "./campaign.js";
import {
  createTerrainProfile,
  buildTerrainSurface,
  buildHorizon,
} from "./terrain.js";
import { buildGroundCover, updateGroundCover } from "./groundcover.js";
import { createAssetBatch, withMaterialManager } from "./asset-loading.js";
import { CinematicRenderer } from "./rendering.js";
import {
  buildFireEffects,
  updateFireEffects,
  softParticleMaterial,
} from "./effects.js";
import { buildHazards, updateHazards } from "./hazards.js";
import { buildRuinGrowth, updateRuinGrowth } from "./ruin-growth.js";
import { buildAtmosphere, updateAtmosphere } from "./atmosphere.js";
import { configureSunShadow } from "./sun-shadows.js";
import {
  CameraSurfaces,
  followCamera,
  constrainCamera,
  boxEntry,
} from "./camera-collision.js";
import {
  EXPEDITIONS,
  currentFieldTask,
  fieldComplete,
  carryingComponent,
} from "./expeditions.js";
import {
  buildFieldStation,
  buildFieldGates,
  updateFieldWorld,
  finishFieldTask,
} from "./field-world.js";
import {
  buildSoundLandmarks,
  updateSoundLandmarks,
  updateSoundSources,
} from "./sound-landmarks.js";
import {
  pbrMaterial,
  mergeArchitecture,
  loadExplorer,
  loadNature,
  animateExplorer,
  buildTrees,
  loadPanorama,
  loadForest,
  updateForest,
  updateNature,
} from "./visuals.js";

import {
  buildGuardian,
  updateGuardians,
  hitGuardian,
  startDodge,
  updateDodge,
  isEvading,
} from "./combat.js";

import {
  CROUCH_DROP,
  toggleCrouch,
  updateCrouch,
  playerNoise,
  playerFootstep,
  stealthState,
  guardianEngaged,
} from "./stealth.js";
export const CELL = 7;
const UP = new THREE.Vector3(0, 1, 0);

export class Adventure {
  constructor(container, store, audio, callbacks = {}) {
    this.container = container;
    this.store = store;
    this.audio = audio;
    this.cb = callbacks;
    this.keys = new Set();
    this.paused = true;
    this.active = false;
    this.yaw = 0;
    this.pitch = 0.34;
    this.clock = new THREE.Clock();
    this.lastSave = 0;
    this.stamina = 100;
    this.velocityY = 0;
    this.actualMoveSpeed = 0;
    this.jumpY = 0;
    this.grounded = true;
    this.attackCooldown = 0;
    this.sense = 0;
    this.hitTimer = 0;
    this.elapsed = 0;
    this.touchMove = { x: 0, z: 0 };
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.store.data.settings.quality === "high" ? 1.75 : 1,
      ),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled =
      this.store.data.settings.quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(
      58,
      container.clientWidth / container.clientHeight,
      0.1,
      450,
    );
    this.raycaster = new THREE.Raycaster();
    this.temp = new THREE.Vector3();
    this.onKeyDown = (e) => {
      if (
        !this.active ||
        (e.target.matches("input,button,select,textarea") &&
          e.code !== "Escape")
      )
        return;
      if (
        [
          "Space",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Tab",
        ].includes(e.code)
      )
        e.preventDefault();
      if (e.repeat && e.code === "Space") return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Escape") {
        this.cb.pause?.();
        return;
      }
      if (this.paused) return;
      if (e.code === "KeyV")
        setAim(this, "toggle", !this.aimSources?.has("toggle"));
      if (e.code === "KeyE") this.interact();
      if (e.code === "KeyB") this.toggleCrouch();
      if (e.code === "KeyT") this.useTorch();
      if (e.code === "KeyF") this.attack();
      if (e.code === "KeyR") this.evade();
      if (e.code === "KeyQ") {
        this.sense = 7;
        this.audio.tone();
      }
      if (e.code === "KeyH") this.heal();
      if (e.code === "KeyM") this.cb.map?.();
      if (e.code === "KeyJ") this.cb.journal?.();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => {
      this.keys.clear();
      if (this.active && !this.paused) this.cb.pause?.();
    };
    this.onMouse = (e) => {
      if (this.paused || !this.active) return;
      if (
        document.pointerLockElement === this.renderer.domElement ||
        this.dragging
      ) {
        const precision = this.desertSurvey?.focus
          ? 0.3
          : this.aiming
            ? 0.55
            : 1;
        this.yaw -=
          (e.movementX *
            0.003 *
            precision *
            this.store.data.settings.sensitivity) /
          50;
        this.pitch = Math.max(
          this.aiming ? -0.65 : -0.12,
          Math.min(
            1.05,
            this.pitch +
              e.movementY *
                0.002 *
                precision *
                (this.store.data.settings.invertY ? -1 : 1),
          ),
        );
      }
    };
    this.renderer.domElement.addEventListener("click", (e) => {
      if (e.pointerType === "touch") return;
      if (!this.paused && this.active) {
        if (document.pointerLockElement === this.renderer.domElement)
          this.attack();
        else this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
      }
    });
    this.renderer.domElement.addEventListener("contextmenu", (e) =>
      e.preventDefault(),
    );
    this.renderer.domElement.addEventListener("pointerdown", (e) => {
      if (this.paused || !this.active) return;
      if (e.button === 2) {
        this.dragging = true;
        setAim(this, "mouse", true);
      }
      if (e.pointerType === "touch") {
        this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.renderer.domElement.setPointerCapture(e.pointerId);
      }
    });
    this.renderer.domElement.addEventListener("pointermove", (e) => {
      if (this.paused || this.lookTouch?.id !== e.pointerId) return;
      const dx = e.clientX - this.lookTouch.x,
        dy = e.clientY - this.lookTouch.y;
      const scale = this.desertSurvey?.focus
        ? 0.0012
        : this.aiming
          ? 0.002
          : 0.004;
      this.yaw -= (dx * scale * this.store.data.settings.sensitivity) / 50;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + dy * scale * (this.store.data.settings.invertY ? -1 : 1),
        this.aiming ? -0.65 : -0.12,
        1.05,
      );
      this.lookTouch.x = e.clientX;
      this.lookTouch.y = e.clientY;
    });
    this.onPointerUp = (e) => {
      if (e.button === 2 || e.type === "pointercancel") {
        this.dragging = false;
        setAim(this, "mouse", false);
      }
      if (this.lookTouch?.id === e.pointerId) this.lookTouch = null;
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouse);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("blur", this.onBlur);
    this.resize = () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.cinematic?.resize();
      this.renderOnce = true;
    };
    window.addEventListener("resize", this.resize);
    this.renderer.setAnimationLoop(() => this.frame());
  }
  material(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...opts });
  }
  box(w, h, d, mat, x, y, z, parent = this.world) {
    const geometry =
      mat.isMeshStandardMaterial && Math.min(w, h, d) > 0.09
        ? new RoundedBoxGeometry(
            w,
            h,
            d,
            1,
            Math.min(0.12, w * 0.08, h * 0.1, d * 0.08),
          )
        : new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, mat);
    if (mat.map) {
      const pos = mesh.geometry.attributes.position,
        normal = mesh.geometry.attributes.normal,
        uv = mesh.geometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(normal.getX(i)),
          ny = Math.abs(normal.getY(i));
        uv.setXY(
          i,
          (nx > 0.5 ? pos.getZ(i) : pos.getX(i)) / 2.5,
          (ny > 0.5 ? pos.getZ(i) : pos.getY(i)) / 2.5,
        );
      }
    }
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    this.cameraSurfaces?.capture(mesh);
    return mesh;
  }
  cylinder(r1, r2, h, mat, x, y, z, parent = this.world, sides = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, sides), mat);
    if (mat.map) {
      const uv = m.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          (uv.getX(i) * Math.PI * (r1 + r2)) / 2.5,
          (uv.getY(i) * h) / 2.5,
        );
    }
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    this.cameraSurfaces?.capture(m);
    return m;
  }
  groundHeight(x, z) {
    if (this.terrainProfile) {
      let ground = this.terrainProfile.height(x, z);
      // Restored slag is a solid crust above the excavated bed. Standing and
      // resuming here must place the explorer on that surface, not ankle-deep
      // inside it. Hot pools still use the bed for their damage intersection.
      if (this.level?.biome === "volcano")
        for (const water of this.waterMeshes || []) {
          const site = water.userData;
          if (
            site.kind === "lava" &&
            site.cooled &&
            Math.abs(x - water.position.x) < site.width / 2 &&
            Math.abs(z - water.position.z) < site.length / 2
          )
            ground = Math.max(ground, water.position.y);
        }
      return ground;
    }
    return (
      Math.sin(x * 0.017) * 1.8 +
      Math.cos(z * 0.02) * 1.6 +
      Math.sin((x + z) * 0.035) * 0.45
    );
  }
  load(level, index, { preparing = false } = {}) {
    this.preparing = preparing;
    this.assetBatch = createAssetBatch();
    const batch = this.assetBatch;
    try {
      return withMaterialManager(batch.manager, () =>
        this.buildLevel(level, index),
      );
    } catch (error) {
      batch.seal([{ status: "rejected", reason: error }]);
      throw error;
    }
  }
  buildLevel(level, index) {
    this.active = false;
    this.presentationRemaining = 0;
    this.cinematic?.dispose();
    this.level = level;
    this.levelIndex = index;
    this.map = createMap(level);
    this.terrainProfile = createTerrainProfile(this.map, level);
    this.progress = this.store.level(level.id);
    migrateSkyRoute(this.progress, this.map);
    this.progress.field ??= [];
    this.store.data.currentLevel = index;
    this.rng = random(level.seed);
    this.enemies = [];
    this.crouching = false;
    this.crouchCamera = 0;
    this.playerNoises = [];
    this.noiseSerial = 0;
    this.projectiles = [];
    this.dodge = null;
    this.dodgeCooldown = 0;
    this.grounded = true;
    this.swimming = false;
    resetDiving(this);
    this.diveView = null;
    this.tideArchive = [];
    this.aimUntil = 0;
    clearAim(this);
    this.aimBlend = 0;
    this.shotTraces = [];
    this.items = [];
    this.detailPatches = [];
    this.naturePatches = [];
    this.rockGrounding = null;
    this.desertScatter = null;
    this.forestPatches = [];
    this.explored = new Set(this.progress.explored || []);
    this.lastSurvey = null;
    this.waterMeshes = [];
    this.flames = [];
    this.braziers = [];
    this.brazierKit =
      this.brazierPatch =
      this.brazierTime =
      this.brazierStats =
        null;
    this.camps = [];
    this.campMaterials = null;
    this.campEffects = null;
    this.campTime = null;
    this.obstacles = [];
    this.navigationStats = { plans: 0, expanded: 0, maxExpanded: 0 };
    this.elapsed = 0;
    this.stamina = 100;
    this.jumpY = 0;
    this.climb = null;
    this.velocityY = 0;
    resetTraversal(this);
    this.counterweights = null;
    this.traversalCourses = [];
    this.climbingMaterials = null;
    this.keys.clear();
    if (this.scene) {
      disposeInstanceBuffers(this.scene);
      const geometries = new Set(),
        materials = new Set(),
        textures = new Set(),
        skeletons = new Set();
      disposeBirdTemplates(this, geometries);
      this.scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.skeleton) skeletons.add(o.skeleton);
        if (o.customDepthMaterial) materials.add(o.customDepthMaterial);
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            materials.add(m),
          );
      });
      geometries.forEach((g) => g.dispose());
      skeletons.forEach((s) => s.dispose());
      materials.forEach((m) => {
        m.userData.additionalTextures?.forEach((t) => textures.add(t));
        for (const value of Object.values(m)) {
          if (value?.isTexture) textures.add(value);
        }
        m.dispose();
      });
      if (this.scene.background?.isTexture) textures.add(this.scene.background);
      if (this.scene.environment?.isTexture)
        textures.add(this.scene.environment);
      textures.forEach((t) => t.dispose());
      this.sun?.shadow.map?.dispose();
    }
    this.birdKit = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(level.sky);
    this.scene.fog = new THREE.FogExp2(
      level.fog,
      level.biome === "crystal"
        ? 0.012
        : level.biome === "jungle"
          ? 0.0085
          : 0.0058,
    );
    this.world = new THREE.Group();
    this.cameraSurfaces = new CameraSurfaces(this.world);
    this.scene.add(this.world);
    this.scene.add(
      new THREE.HemisphereLight(
        level.biome === "volcano"
          ? 0xffa979
          : level.biome === "jungle"
            ? 0xd4eee2
            : 0xc9dce0,
        level.biome === "jungle" ? 0x364735 : 0x263025,
        level.biome === "jungle" ? 1.35 : 1.05,
      ),
    );
    this.sun = new THREE.DirectionalLight(
      level.biome === "snow" ? 0xe5efff : 0xfff6e3,
      ["crystal", "eclipse"].includes(level.biome) ? 1.5 : 2.4,
    );
    this.sun.position.set(80, 130, 40);
    this.sun.castShadow = true;
    configureSunShadow(this);
    this.scene.add(this.sun, this.sun.target);
    buildAtmosphere(this);
    this.stoneMat = pbrMaterial(
      level.biome === "water"
        ? "palace-stone"
        : level.biome === "desert"
          ? "sandstone-wall"
          : level.biome === "volcano"
            ? "forge-paving"
            : "stone",
      new THREE.Color(level.stone).lerp(new THREE.Color(0xffffff), 0.65),
      1,
    );
    this.darkMat = pbrMaterial(
      level.biome === "water"
        ? "palace-stone"
        : level.biome === "desert"
          ? "sandstone"
          : level.biome === "volcano"
            ? "forge-rock"
            : "rock",
      new THREE.Color(level.stone).multiplyScalar(0.62),
      1,
    );
    if (level.biome === "desert") {
      weatherDesertStone(this.stoneMat);
      this.darkMat.color.set(0xa48a67);
      weatherDesertStone(this.darkMat);
    }
    if (level.biome === "water") {
      this.stoneMat.color.set(0xd8d1b8);
      this.stoneMat.normalScale.set(0.4, 0.4);
      this.stoneMat.name = "Tidal palace marble";
      this.darkMat.color.set(0x959c88);
      this.darkMat.normalScale.set(0.45, 0.45);
      for (const material of [this.stoneMat, this.darkMat])
        weatherPalaceStone(material);
    }
    if (level.biome === "volcano") {
      this.stoneMat.color.set(0xb0b6bb);
      this.darkMat.color.set(0x666c73);
      this.stoneMat.normalScale.set(0.75, 0.75);
      this.darkMat.normalScale.set(0.8, 0.8);
    }
    this.goldMat = this.material(0xc9ac68, {
      metalness: 0.65,
      roughness: 0.35,
    });
    this.glowMat = this.material(0xe7c988, {
      emissive: 0xdca958,
      emissiveIntensity: 1.2,
    });
    this.buildTerrain();
    this.buildArchitecture();
    buildRuinGrowth(this);
    mergeArchitecture(this.world);
    buildGroundCover(this);
    buildDesertPalms(this);
    if (
      !["jungle", "sky", "water", "snow", "desert"].includes(this.level.biome)
    )
      buildTrees(this);
    buildSkyBridges(this);
    this.buildFeatures();
    for (const item of this.items)
      if (item.type === "field") mergeArchitecture(item.group);
    buildFieldGates(this);
    buildSolarChambers(this);
    buildBellCourts(this);
    buildHydraulicCourts(this);
    buildThermalCourts(this);
    buildResonanceCourts(this);
    buildWindCourts(this);
    buildCipherCourts(this);
    buildFireVault(this);
    buildBellHoist(this);
    buildFrozenStair(this);
    buildDesertSurvey(this);
    buildArcadeLock(this);
    buildSunBridge(this);
    buildShutterHouse(this);
    buildEasternReflector(this);
    buildRainGarden(this);
    buildTemperingCart(this);
    buildAstralCrane(this);
    buildEchoCauseway(this);
    buildCoralPump(this);
    buildSurveyorsCleft(this);
    buildPressureRelay(this);
    buildEchoGallery(this);
    buildOrbitVault(this);
    buildCourierFerry(this);
    buildHazards(this);
    buildSoundLandmarks(this);
    buildTideArchive(this);
    buildSunkenGallery(this);
    buildStationYards(this);
    buildTorch(this);
    prepareGuardianPatrols(this);
    this.cameraSurfaces.rebuild();
    this.templeCaptureGeometry?.forEach((g) => g.dispose());
    this.templeCaptureGeometry = [];

    buildFireEffects(this);
    this.buildPlayer();
    this.rig = null;
    this.buildParticles();
    const batch = this.assetBatch;
    this.visualsReady = Promise.allSettled([
      this.terrainTexturesReady,
      loadPanorama(this),
      loadExplorer(this),
      loadNature(this),
      loadForest(this),
      loadMemorialArt(this),
    ]).then((results) => {
      batch.seal(results);
      if (this.assetBatch === batch) this.renderOnce = true;
      return batch.ready;
    });
    const start = this.progress.position || {
      x: this.map.spawn.x * CELL,
      z: this.map.spawn.z * CELL,
    };
    this.player.position.set(
      start.x,
      this.groundHeight(start.x, start.z),
      start.z,
    );
    if (!this.walkable(start.x, start.z)) {
      this.player.position.x = this.map.spawn.x * CELL;
      this.player.position.z = this.map.spawn.z * CELL;
    }
    this.player.position.y = this.groundHeight(
      this.player.position.x,
      this.player.position.z,
    );
    restoreTraversal(this);
    restorePressureArrival(this);
    restoreOrbitArrival(this);
    restoreCausewayArrival(this);
    restoreSurveyArrival(this);
    restoreArcadeArrival(this);
    restoreSunArrival(this);
    restoreShutterArrival(this);
    restoreSkyBridgeArrival(this);
    restoreCourierArrival(this);
    const arrival = safeArrival(this, this.player.position);
    if (arrival) {
      this.player.position.set(arrival.x, arrival.y, arrival.z);
      this.jumpY = arrival.y - this.groundHeight(arrival.x, arrival.z);
    } else {
      const x = this.map.spawn.x * CELL,
        z = this.map.spawn.z * CELL;
      this.player.position.set(x, this.groundHeight(x, z), z);
      this.jumpY = 0;
      this.courseAnchor = null;
    }
    restoreWaterArrival(this);
    restoreGalleryArrival(this);
    const next =
      this.items.find(
        (f) => f.id === currentFieldTask(level, this.progress)?.id,
      ) ||
      this.items.find(
        (f) => f.type === "mechanism" && f.stage === this.progress.stage,
      ) ||
      this.items.find((f) => f.type === "exit") ||
      this.map.rooms[1];
    this.restoreCamera(next);
    this.checkpoint = this.progress.checkpoint || {
      x: this.map.spawn.x * CELL,
      z: this.map.spawn.z * CELL,
    };
    this.health = this.progress.health || 100;
    this.paused = this.preparing;
    this.active = !this.preparing;
    this.clock.getDelta();
    this.cinematic = new CinematicRenderer(this);
    this.applySettings();
    updateCaverns(this, 0);
    updateObservatory(this, 0);
    this.audio.start(level.biome, this.soundSources, {
      paused: this.preparing,
    });
    this.audio.setMix(this.store.data.settings);
    updateHazards(this, 0);
    this.updateAudio();
    this.cb.update?.(this.state());
    this.cb.toast?.(level.intro, 6500);
    this.save();
  }
  makeTexture(type) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = type === "stone" ? "#bbb9af" : "#a7aca0";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2800; i++) {
      const v = Math.floor(this.rng() * 70 + 130);
      ctx.fillStyle = `rgba(${v},${v},${v},${this.rng() * 0.3})`;
      ctx.fillRect(
        this.rng() * 128,
        this.rng() * 128,
        this.rng() * 5 + 1,
        this.rng() * 3 + 1,
      );
    }
    if (type === "stone") {
      ctx.strokeStyle = "#7a7c7440";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 32);
        ctx.lineTo(128, i * 32 + this.rng() * 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo((i % 2) * 32 + 32, i * 32);
        ctx.lineTo((i % 2) * 32 + 32, (i + 1) * 32);
        ctx.stroke();
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  buildTerrain() {
    const size = this.map.size * CELL;
    buildTerrainSurface(this);
    buildWaterSurfaces(this);
    // Restore completed hydraulic work before placing landmarks or the player.
    updateWaterSurfaces(this, 100);
    buildHorizon(this);
  }
  buildArchitecture() {
    this.templePatches = [];
    this.templeWind = null;
    const hasDesert = buildDesertArchitecture(this);
    const hasMonastery = buildMonasteryArchitecture(this);
    const hasPalace = buildPalaceArchitecture(this);
    const hasForge = buildForgeArchitecture(this);
    const hasSky = buildSkyArchitecture(this);
    const hasCavern = buildCaverns(this);
    const hasObservatory = buildObservatory(this);
    const hasTemple =
      buildTempleArchitecture(this) ||
      hasDesert ||
      hasMonastery ||
      hasPalace ||
      hasForge ||
      hasSky ||
      hasCavern ||
      hasObservatory;
    const dark = this.darkMat,
      stone = this.stoneMat;
    this.map.rooms.forEach((r, i) => {
      const x = r.x * CELL,
        z = r.z * CELL,
        y = this.groundHeight(x, z);
      if (!hasTemple) {
        // Four carved piers and open lintels leave generous approaches to every objective.
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            const px = x + sx * 19,
              pz = z + sz * 18,
              py = this.groundHeight(px, pz);
            this.obstacles.push({ x: px, z: pz, w: 1.5, d: 1.5, h: 9 });
            this.box(3.7, 0.7, 3.7, dark, px, py + 0.3, pz);
            this.cylinder(1.05, 1.4, 8, stone, px, py + 4.4, pz);
            this.box(3.2, 0.6, 3.2, stone, px, py + 8.6, pz);
            this.box(2.8, 0.4, 2.8, this.goldMat, px, py + 7.4, pz);
            for (let k = 0; k < 3; k++)
              this.box(2.2, 0.13, 2.2, dark, px, py + 1.5 + k * 2, pz);
          }
        this.box(40, 1.4, 3.1, stone, x, y + 9.3, z - 18);
        this.box(40, 0.35, 3.8, dark, x, y + 10.2, z - 18);
        for (let k = 0; k < 5; k++)
          this.box(
            16 - k * 2.2,
            1.1,
            7 - k * 0.8,
            stone,
            x,
            y + 10.4 + k * 1.1,
            z - 18,
          );
      }
      // Central stair dais is low enough to step onto, with a jumpable final lip.
      if (i > 1) {
        for (let k = 0; k < 3; k++)
          this.box(9 - k * 1.4, 0.23, 9 - k * 1.4, stone, x, y + k * 0.2, z);
      }
      for (const sx of [-1, 1]) {
        const tx = x + sx * 8,
          tz = z - 9;
        buildBrazier(this, tx, tz, `court-${i}-${sx}`);
      }
      if (i % 3 === 1) {
        const bx = x + 12,
          bz = z + 7;
        this.box(7, 1.3, 1.4, stone, bx, y + 0.65, bz);
        this.obstacles.push({
          x: bx,
          z: bz,
          w: 3.8,
          d: 1,
          h: 1.3,
          climbable: true,
        });
      }
    });
    finishBraziers(this);
    if (hasTemple) return;
    // A large distant temple crowns each chapter.
    const last = this.map.rooms.at(-1),
      tx = last.x * CELL,
      tz = last.z * CELL - 29,
      ty = this.groundHeight(tx, tz);
    for (let k = 0; k < 7; k++)
      this.box(28 - k * 3, 2.5, 17 - k * 1.7, stone, tx, ty + k * 2.5, tz);
    this.cylinder(0, 4, 12, this.goldMat, tx, ty + 22, tz, undefined, 4);
  }
  buildVegetation() {
    const { biome } = this.level,
      rng = this.rng;
    const green = ["jungle", "sky"].includes(biome),
      snow = biome === "snow";
    const leaf = this.material(
      snow ? 0xe1e6df : biome === "desert" ? 0x899478 : 0x365d38,
    );
    const trunk = this.material(0x594e37);
    const count = green ? 520 : 160;
    const d = new THREE.Object3D();
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      leaf,
      count * 3,
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.35, 0.7, 1, 6),
      trunk,
      count,
    );
    let used = 0;
    for (let i = 0; i < count * 4 && used < count; i++) {
      const gx = 2 + Math.floor(rng() * (this.map.size - 4)),
        gz = 2 + Math.floor(rng() * (this.map.size - 4));
      if (this.map.grid[gz][gx]) continue;
      const x = gx * CELL + (rng() - 0.5) * 4,
        z = gz * CELL + (rng() - 0.5) * 4,
        y = this.groundHeight(x, z);
      const h = green ? 9 + rng() * 14 : 3 + rng() * 5;
      d.position.set(x, y + h / 2, z);
      d.rotation.set(0, rng() * 6, 0.06);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      trunks.setMatrixAt(used, d.matrix);
      for (let k = 0; k < 3; k++) {
        d.position.set(
          x + (rng() - 0.5) * 5,
          y + h - 1 + k * 1.6,
          z + (rng() - 0.5) * 5,
        );
        d.scale.set(3 + rng() * 3, 2 + rng() * 2, 3 + rng() * 3);
        d.rotation.set(rng(), rng(), rng());
        d.updateMatrix();
        crowns.setMatrixAt(used * 3 + k, d.matrix);
        crowns.setColorAt(
          used * 3 + k,
          new THREE.Color().setScalar(0.7 + rng() * 0.5),
        );
      }
      used++;
    }
    crowns.count = used * 3;
    trunks.count = used;
    if (!["volcano", "crystal", "eclipse"].includes(biome)) {
      crowns.castShadow = true;
      trunks.castShadow = true;
      this.world.add(crowns, trunks);
    } else {
      crowns.geometry.dispose();
      trunks.geometry.dispose();
      leaf.dispose();
      trunk.dispose();
    }
    // Ferns and grasses follow path edges, keeping the center legible.
    const grassCount = green ? 2000 : 700,
      grass = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.4, 1.4, 3),
        this.material(snow ? 0xd6ded9 : green ? 0x66804b : 0x8a866b),
        grassCount,
      );
    let j = 0;
    for (let i = 0; i < grassCount * 4 && j < grassCount; i++) {
      const gx = 1 + Math.floor(rng() * (this.map.size - 2)),
        gz = 1 + Math.floor(rng() * (this.map.size - 2));
      if (!this.map.grid[gz][gx]) continue;
      const x = gx * CELL + (rng() - 0.5) * 7,
        z = gz * CELL + (rng() - 0.5) * 7;
      d.position.set(x, this.groundHeight(x, z) + 0.35, z);
      d.scale.set(1 + rng(), 0.5 + rng(), 1 + rng());
      d.rotation.set((rng() - 0.5) * 0.6, rng() * 6, (rng() - 0.5) * 0.6);
      d.updateMatrix();
      grass.setMatrixAt(j++, d.matrix);
    }
    grass.count = j;
    this.world.add(grass);
  }
  buildFeatures() {
    for (const f of this.map.features) {
      const group = new THREE.Group(),
        x = f.x * CELL,
        z = f.z * CELL,
        y = this.groundHeight(x, z);
      group.position.set(x, y, z);
      this.world.add(group);
      f.group = group;
      if (
        f.type === "mechanism" &&
        ["snow", "sky"].includes(this.level.biome) &&
        !hasCounterweights(f)
      ) {
        f.yOffset = 2.8 + (f.stage % 3) * 0.3;
        this.box(6, f.yOffset, 6, this.stoneMat, x, y + f.yOffset / 2, z);
        this.obstacles.push({
          x,
          z,
          w: 3,
          d: 3,
          h: f.yOffset,
          climbable: true,
        });
        group.position.y += f.yOffset;
        for (let rung = 0; rung < 6; rung++)
          this.box(
            1.1,
            0.08,
            0.12,
            this.goldMat,
            x,
            y + 0.3 + rung * 0.5,
            z + 3.06,
          );
      }
      if (f.type === "field") {
        buildFieldStation(this, f, group);
      } else if (f.type === "mechanism") {
        if (hasCounterweights(f)) {
          buildCounterweights(this, f, group);
        } else {
          this.cylinder(1.8, 2.1, 0.8, this.darkMat, 0, 0.5, 0, group);
          this.cylinder(1.4, 1.6, 0.35, this.goldMat, 0, 1.05, 0, group);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.1, 0.12, 8, 32),
            this.goldMat,
          );
          ring.rotation.x = -Math.PI / 3;
          ring.position.y = 1.65;
          group.add(ring);
          const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.55),
            this.glowMat,
          );
          core.position.y = 1.7;
          group.add(core);
          f.core = core;
        }
      } else if (f.type === "camp") {
        buildCamp(this, f, group);
      } else {
        const mat = f.type === "relic" ? this.glowMat : this.goldMat;
        const geo =
          f.type === "note"
            ? new THREE.BoxGeometry(0.7, 0.15, 0.9)
            : new THREE.OctahedronGeometry(f.type === "relic" ? 1 : 0.4);
        const item = new THREE.Mesh(geo, mat);
        item.position.y = f.type === "relic" ? 2 : 1;
        group.add(item);
        f.core = item;
        this.cylinder(0.5, 0.75, 0.65, this.stoneMat, 0, 0.35, 0, group);
      }
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18),
        new THREE.MeshBasicMaterial({
          color: f.type === "camp" ? 0x9ebd8a : 0xe3c184,
        }),
      );
      marker.position.y = 3.4;
      group.add(marker);
      f.marker = marker;
      this.items.push(f);
    }
    for (const e of this.map.enemies) {
      if (!this.progress.defeated.includes(e.id))
        this.enemies.push(buildGuardian(this, e));
    }
  }
  buildPlayer() {
    this.player = new THREE.Group();
    this.player.userData.actor = true;
    this.avatar = new THREE.Group();
    this.player.add(this.avatar);
    this.world.add(this.player);
    const skin = this.material(0xc69d7e),
      shirt = this.material(0x526c65),
      pants = this.material(0x3b4441),
      leather = this.material(0x4c3b2c),
      hair = this.material(0x332821);
    const a = this.avatar;
    const torso = this.cylinder(0.3, 0.25, 0.68, shirt, 0, 1.35, 0, a, 8);
    torso.scale.z = 0.7;
    this.box(0.51, 0.15, 0.32, leather, 0, 1, 0, a);
    this.cylinder(0.105, 0.12, 0.15, skin, 0, 1.8, 0, a);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 10), skin);
    head.scale.set(0.85, 1.15, 0.85);
    head.position.y = 2.01;
    a.add(head);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.242, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.64),
      hair,
    );
    cap.position.y = 2.06;
    a.add(cap);
    this.box(0.16, 0.43, 0.15, hair, 0, 1.85, -0.21, a);
    this.limbs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.16, 1, 0);
      this.cylinder(0.105, 0.14, 0.7, pants, 0, -0.33, 0, leg, 8);
      this.box(0.22, 0.27, 0.39, leather, 0, -0.82, 0.075, leg);
      a.add(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.36, 1.64, 0);
      this.cylinder(0.09, 0.105, 0.36, shirt, 0, -0.14, 0, arm, 8);
      this.cylinder(0.075, 0.09, 0.4, skin, 0, -0.49, 0, arm, 8);
      a.add(arm);
      this.limbs.push(leg, arm);
    }
    this.box(0.4, 0.49, 0.22, leather, 0, 1.37, -0.25, a);
    this.box(0.44, 0.08, 0.24, this.goldMat, 0, 1.55, -0.25, a);
    this.box(0.07, 0.7, 0.07, leather, 0.2, 1.4, 0.18, a);
    this.box(0.11, 0.25, 0.17, this.darkMat, 0.29, 0.83, 0.06, a);
    this.playerLight = new THREE.PointLight(
      0xffd6a0,
      this.level.biome === "crystal" ? 4 : 0.45,
      12,
      1.6,
    );
    this.playerLight.position.set(0, 2, 0.4);
    this.player.add(this.playerLight);
  }
  buildParticles() {
    const n = this.store.data.settings.quality === "low" ? 100 : 450,
      p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (this.rng() - 0.5) * 110;
      p[i * 3 + 1] = this.rng() * 30;
      p[i * 3 + 2] = (this.rng() - 0.5) * 110;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.particles = new THREE.Points(
      geo,
      softParticleMaterial({
        color:
          this.level.biome === "snow"
            ? 0xffffff
            : this.level.biome === "volcano"
              ? 0xffa16b
              : 0xffe9b0,
        size: this.level.biome === "snow" ? 0.16 : 0.08,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.scene.add(this.particles);
  }
  walkable(x, z) {
    if (skySpanCorridor(this, x, z) || courierCorridor(this.map, x, z))
      return true;
    const gx = Math.round(x / CELL),
      gz = Math.round(z / CELL);
    return !!this.map.grid[gz]?.[gx];
  }
  canMove(x, z, height = this.jumpY, clearance = 1.8) {
    const worldY = this.groundHeight(x, z) + height;
    if (galleryAt(this, x, worldY, z))
      return galleryClear(this, x, worldY, z, clearance);
    if (!cavernClear(this, x, this.groundHeight(x, z) + height, z, clearance))
      return false;
    if (skyBridgeBlocked(this, x, z, this.groundHeight(x, z) + height))
      return false;
    if (vaultBridgeBlocked(this, x, z, worldY)) return false;
    if (hoistBlocked(this, x, z, worldY, clearance)) return false;
    if (surveyBlocked(this, x, z, worldY, clearance)) return false;
    if (arcadeBlocked(this, x, z, worldY, clearance)) return false;
    if (sunBlocked(this, x, z, worldY, clearance)) return false;
    if (shutterBlocked(this, x, z, worldY, clearance)) return false;
    if (frozenStairBlocked(this, x, z, worldY, clearance)) return false;
    if (craneBlocked(this, x, z, worldY, clearance)) return false;
    if (causewayBlocked(this, x, z, worldY, clearance)) return false;
    if (reflectorBlocked(this, x, z, worldY, clearance)) return false;
    if (cartBlocked(this, x, z, worldY, clearance)) return false;
    if (gardenBlocked(this, x, z, worldY, clearance)) return false;
    if (coralPumpBlocked(this, x, z, worldY, clearance)) return false;
    if (cleftBlocked(this, x, z, worldY, clearance)) return false;
    if (pressureBlocked(this, x, z, worldY, clearance)) return false;
    if (echoBlocked(this, x, z, worldY, clearance)) return false;
    if (orbitBlocked(this, x, z, worldY, clearance)) return false;
    if (courierBlocked(this, x, z, worldY)) return false;
    for (const dx of [-0.45, 0.45])
      for (const dz of [-0.45, 0.45])
        if (!this.walkable(x + dx, z + dz)) return false;
    for (const o of this.obstacles) {
      if (o.fieldStation) {
        if (stationBlocked(o, x, worldY, z, clearance)) return false;
        continue;
      }
      if (
        o.h > 0 &&
        Math.abs(x - o.x) < o.w &&
        Math.abs(z - o.z) < o.d &&
        this.groundHeight(x, z) + height <
          this.groundHeight(o.x, o.z) + o.h - 0.2
      )
        return false;
    }
    return true;
  }
  lineOfSight(a, b, fromHeight = 1.4, toHeight = 1.4) {
    const from = { x: a.x, y: a.y + fromHeight, z: a.z },
      to = { x: b.x, y: b.y + toHeight, z: b.z };
    if (hoistOccludes(this, from, to)) return false;
    if (surveyOccludes(this, from, to)) return false;
    if (arcadeOccludes(this, from, to)) return false;
    if (sunOccludes(this, from, to)) return false;
    if (shutterOccludes(this, from, to)) return false;
    if (frozenStairOccludes(this, from, to)) return false;
    if (craneOccludes(this, from, to)) return false;
    if (causewayOccludes(this, from, to)) return false;
    if (reflectorOccludes(this, from, to)) return false;
    if (cartOccludes(this, from, to)) return false;
    if (gardenOccludes(this, from, to)) return false;
    if (coralPumpOccludes(this, from, to)) return false;
    if (cleftOccludes(this, from, to)) return false;
    if (pressureOccludes(this, from, to)) return false;
    if (echoOccludes(this, from, to)) return false;
    if (orbitOccludes(this, from, to)) return false;
    if (courierOccludes(this, from, to)) return false;
    for (const o of this.obstacles || []) {
      if (o.fieldStation) {
        if (stationEntry(o, from, to) !== null) return false;
        continue;
      }
      if (o.h <= 0.2) continue;
      const base = this.groundHeight(o.x, o.z);
      if (
        boxEntry(
          from,
          to,
          {
            min: { x: o.x - o.w, y: base, z: o.z - o.d },
            max: { x: o.x + o.w, y: base + o.h, z: o.z + o.d },
          },
          0,
          true,
        ) !== null
      )
        return false;
    }
    const dist = a.distanceTo(b),
      interior =
        galleryAt(this, from.x, from.y, from.z) ||
        galleryAt(this, to.x, to.y, to.z),
      steps = Math.ceil(dist / (interior ? 0.2 : 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = from.y + (to.y - from.y) * t;
      if (galleryAt(this, x, y, z)) {
        if (!galleryClear(this, x, y, z, 0.05, 0.02)) return false;
        continue;
      }
      const height = y - this.groundHeight(x, z);
      if (height < 0.15 || !this.canMove(x, z, height, 0)) return false;
    }
    return true;
  }
  frame() {
    const elapsedReal = this.clock.getDelta();
    const dt = Math.min(elapsedReal, 0.05);
    if (!this.active || !this.scene) return;
    const presenting = this.paused && this.presentationRemaining > 0;
    if (this.paused && !this.renderOnce && !presenting) return;
    if (presenting)
      this.presentationRemaining = Math.max(
        0,
        this.presentationRemaining - elapsedReal,
      );
    this.renderOnce = false;
    this.elapsed += dt;
    if (!this.paused) {
      updateShotTraces(this, dt);
      this.updatePlayer(dt);
      updateHazards(this, dt);
      this.updateEnemies(dt);
      this.progress.time += elapsedReal;
      this.lastSave += elapsedReal;
      if (this.lastSave > 10) {
        this.save();
        this.lastSave = 0;
      }
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      this.hitTimer = Math.max(0, this.hitTimer - dt);
      this.sense = Math.max(0, this.sense - dt);
    }
    this.updateCamera(dt);
    this.updateDecorations(
      dt,
      presenting ? (this.presentationRemaining > 0 ? elapsedReal : 100) : dt,
      elapsedReal,
    );
    this.updateAudio();
    this.renderScene(dt);
    if (!this.paused && Math.floor(this.elapsed * 10) !== this.lastUi) {
      this.lastUi = Math.floor(this.elapsed * 10);
      this.cb.update?.(this.state());
    }
  }
  renderScene(dt = 0) {
    updateSunBridgeDepth(this);
    if (this.cinematic) this.cinematic.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
  updatePlayer(dt) {
    updateAstralCrane(this, dt);
    updateEchoCauseway(this, dt);
    updateTemperingCart(this, dt);
    updateCourierFerry(this, dt);
    updateOrbitVault(this, dt);
    updateSkyGusts(this);
    this.skyWind = null;
    // Scripted traversal supplies its own motion. Only the regular collision
    // controller below reports measured travel for locomotion selection.
    this.actualMoveSpeed = null;
    updateBellHoist(this, dt);
    updateFrozenStair(this, dt);
    updateDesertSurvey(this, dt);
    updateArcadeLock(this, dt);
    updateSunBridge(this, dt);
    updateShutterHouse(this, dt);
    updateEasternReflector(this, dt);
    updateRainGarden(this, dt);
    updateCoralPump(this, dt);
    updatePressureRelay(this, dt);
    this.dodgeCooldown = Math.max(0, (this.dodgeCooldown || 0) - dt);
    let x =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) +
      this.touchMove.x;
    let z =
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) +
      this.touchMove.z;
    const length = Math.max(1, Math.hypot(x, z));
    x /= length;
    z /= length;
    const cameraRate = this.desertSurvey?.focus ? 0.2 : 1;
    if (this.keys.has("KeyZ")) this.yaw += dt * 1.5 * cameraRate;
    if (this.keys.has("KeyC")) this.yaw -= dt * 1.5 * cameraRate;
    if (this.keys.has("KeyI"))
      this.pitch = Math.max(-0.65, this.pitch - dt * 0.65 * cameraRate);
    if (this.keys.has("KeyK"))
      this.pitch = Math.min(1.05, this.pitch + dt * 0.65 * cameraRate);
    if (controlSurveyScope(this, dt, x, z)) {
      this.nearest = null;
      this.survey();
      return;
    }
    const input = {
      x: x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
      z: -x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
    };
    this.carrying = !!carryingComponent(this.level, this.progress);
    updateAim(this);
    updateCrouch(this);
    if (controlAstralCrane(this, dt, x, -z)) {
      animateExplorer(this, dt, false, false);
      poseAstralCrane(this);
      this.nearest = null;
      this.survey();
      return;
    }
    if (controlTemperingCart(this, dt, -z)) {
      animateExplorer(this, dt, false, false);
      poseTemperingCart(this);
      this.nearest = null;
      this.survey();
      return;
    }
    if (controlCourier(this, dt, x)) {
      animateExplorer(this, dt, false, false);
      poseCourier(this);
      this.survey();
      return;
    }
    if (updateCleft(this, dt, x, -z)) {
      animateExplorer(this, dt, false, false);
      this.survey();
      return;
    }
    if (
      advanceArcadeTurn(this, dt, input) ||
      advanceSunTurn(this, dt, input) ||
      advanceShutterTurn(this, dt, input) ||
      advanceOrbitBearing(this, dt, input) ||
      advancePressureOperation(this, dt, input) ||
      advanceCausewayWheel(this, dt, input)
    ) {
      animateExplorer(
        this,
        dt,
        Math.hypot(this.moveVelocity.x, this.moveVelocity.z) > 0.1,
        false,
      );
      this.survey();
      return;
    }
    if (updateCounterweightGrip(this, dt, -z)) {
      animateExplorer(
        this,
        dt,
        Math.hypot(this.moveVelocity.x, this.moveVelocity.z) > 0.05,
        false,
      );
      poseCounterweight(this);
      this.survey();
      return;
    }
    if (updateTraversal(this, dt, input)) {
      animateExplorer(this, dt, !!this.zipRide?.approach, false);
      this.survey();
      return;
    }
    if (this.dodge) {
      animateExplorer(this, dt, true, true);
      updateDodge(this, dt);
      this.survey();
      return;
    }
    if (this.climb) {
      this.updateClimb(dt);
      trackTraversalSupport(this);
      return;
    }
    const moving = Math.abs(x) + Math.abs(z) > 0.05;
    const depth = wadingDepth(this);
    const sprint =
      (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) &&
      this.stamina > 3 &&
      !this.carrying &&
      !this.swimming &&
      !this.aiming &&
      !this.crouching &&
      depth < 0.25 &&
      moving;
    const speed = this.crouching
      ? 2.2
      : this.aiming
        ? 2.6
        : depth > 0.25
          ? 3.8
          : this.carrying
            ? 4.6
            : sprint
              ? 10
              : 6;
    this.stamina = Math.max(
      0,
      Math.min(100, this.stamina + (sprint ? -15 : 10) * dt),
    );
    const jump = this.keys.has("Space");
    if (!this.diving) this.keys.delete("Space");
    if (jump && this.grounded && moving && this.tryClimb(x, z)) return;
    const p = this.player.position,
      oldX = p.x,
      oldZ = p.z;
    this.moveVelocity = { x: input.x * speed, z: input.z * speed };
    if (!advanceSwimming(this, input, dt, jump))
      advanceCharacter(
        this,
        shutterWindVelocity(this, skyWindVelocity(this, this.moveVelocity)),
        dt,
        jump,
      );
    updateCrouch(this);
    recoverSkyBridgeFall(this);
    recoverOrbitFall(this);
    recoverSunFall(this);
    recoverCausewayFall(this);
    recoverCourierFall(this);
    if (this.climb) return;
    trackTraversalSupport(this);
    this.stepDistance =
      (this.stepDistance || 0) + Math.hypot(p.x - oldX, p.z - oldZ);
    this.actualMoveSpeed = dt > 0 ? Math.hypot(p.x - oldX, p.z - oldZ) / dt : 0;
    if (this.motionLanding?.drop > 1) {
      this.audio.noiseHit?.(0.012, 0.18, 800, p);
      playerNoise(this, 16, "landing");
    }
    if (moving) {
      const angle = Math.atan2(input.x, input.z),
        delta = angle - this.avatar.rotation.y;
      this.avatar.rotation.y +=
        Math.atan2(Math.sin(delta), Math.cos(delta)) * Math.min(1, dt * 14);
      const swing = Math.sin(this.elapsed * (sprint ? 15 : 10)) * 0.6;
      this.limbs[0].rotation.x = swing;
      this.limbs[2].rotation.x = -swing;
      this.limbs[1].rotation.x = -swing;
      this.limbs[3].rotation.x = swing;
    } else
      this.limbs.forEach((l) => (l.rotation.x *= Math.max(0, 1 - dt * 10)));
    animateExplorer(this, dt, moving && !this.swimming, sprint);
    if (this.grounded && moving && this.stepDistance > (sprint ? 2.5 : 1.8)) {
      if (depth > 0.12) {
        waterSplash(this, p, 0.6);
        playerNoise(this, 12, "splash");
      } else if (!this.rig?.grounding?.active)
        playerFootstep(this, this.level.biome, sprint, p);
      this.stepDistance = 0;
    }
    if (
      this.level.biome === "volcano" &&
      this.jumpY < 0.3 &&
      this.hitTimer <= 0 &&
      hotLavaAt(this, p.x, p.z)
    )
      this.damage(9);
    this.survey();
    let nearest = null,
      dist = 5;
    for (const f of this.items) {
      if (
        this.progress.found.includes(f.id) ||
        (f.type === "field" &&
          (f.stage < this.progress.stage ||
            this.progress.field.includes(f.id) ||
            ((f.reflectorHeight !== undefined ||
              f.gardenHeight !== undefined ||
              f.cartHeight !== undefined ||
              f.craneHeight !== undefined ||
              f.causewayHeight !== undefined ||
              f.surveyHeight !== undefined ||
              f.arcadeHeight !== undefined ||
              f.sunHeight !== undefined ||
              f.shutterHeight !== undefined) &&
              Math.abs(p.y - f.group.position.y) > 0.8))) ||
        (f.type === "mechanism" && f.stage < this.progress.stage) ||
        (f.type === "solar" &&
          (f.stage !== this.progress.stage ||
            !solarReady(this, this.solarSites[f.stage]))) ||
        (f.type === "hydraulic" &&
          (!hydraulicReady(this, this.hydraulicSites[f.stage]) ||
            Math.abs(
              this.player.position.y - this.groundHeight(f.x * 7, f.z * 7),
            ) > 0.8)) ||
        (f.type === "wind" &&
          (!windReady(this, this.windSites[f.stage]) ||
            Math.abs(p.y - f.group.position.y) > 0.8)) ||
        (f.type === "resonator" &&
          (!resonanceReady(this, this.resonanceSites[f.stage]) ||
            Math.abs(p.y - f.group.position.y) > 0.8)) ||
        (f.type === "cipher" &&
          (!cipherReady(this, this.cipherSites[f.stage]) ||
            Math.abs(p.y - f.group.position.y) > 0.8)) ||
        (f.type === "thermal" &&
          (!thermalReady(this, this.thermalSites[f.stage]) ||
            Math.abs(this.player.position.y - f.group.position.y) > 0.8)) ||
        (f.type === "bell" &&
          (!bellReady(this, this.bellSites[f.stage]) ||
            Math.abs(
              this.player.position.y - this.bellSites[f.stage].root.position.y,
            ) > 0.9))
      )
        continue;
      const d = Math.hypot(
        f.x * CELL - this.player.position.x,
        f.z * CELL +
          (hasCounterweights(f) && counterweightsReady(this, f) ? -5 : 0) -
          this.player.position.z,
      );
      const range =
        hasCounterweights(f) && counterweightsReady(this, f)
          ? 2.4
          : f.type === "field"
            ? 2.6
            : f.type === "solar"
              ? 2.25
              : [
                    "hydraulic",
                    "thermal",
                    "resonator",
                    "wind",
                    "cipher",
                  ].includes(f.type)
                ? 1.6
                : f.type === "bell"
                  ? 1.35
                  : 5;
      if (d < dist && d < range) {
        nearest = f;
        dist = d;
      }
    }
    this.nearest = nearest;
  }
  survey() {
    const x = Math.round(this.player.position.x / CELL),
      z = Math.round(this.player.position.z / CELL),
      key = `${x},${z}`;
    if (this.lastSurvey === key) return;
    this.lastSurvey = key;
    for (let dz = -5; dz <= 5; dz++)
      for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dz * dz > 30) continue;
        const nx = x + dx,
          nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < this.map.size && nz < this.map.size)
          this.explored.add(`${nx},${nz}`);
      }
  }
  tryClimb(x, z) {
    const direction = new THREE.Vector3(
      x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
      0,
      -x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
    ).normalize();
    if (tryArcadeClimb(this, direction)) return true;
    const p = this.player.position;
    for (const o of this.obstacles) {
      const top = this.groundHeight(o.x, o.z) + o.h;
      if (!o.climbable || top - p.y > 3.6 || top <= p.y + 0.2) continue;
      const tx = p.x + direction.x * 1.5,
        tz = p.z + direction.z * 1.5;
      if (Math.abs(tx - o.x) < o.w + 0.35 && Math.abs(tz - o.z) < o.d + 0.35) {
        const end = stationMantleEnd(
          this,
          o,
          p,
          new THREE.Vector3(
            Math.max(
              o.x - o.w + 0.7,
              Math.min(o.x + o.w - 0.7, tx + direction.x),
            ),
            this.groundHeight(o.x, o.z) + o.h,
            Math.max(
              o.z - o.d + 0.7,
              Math.min(o.z + o.d - 0.7, tz + direction.z),
            ),
          ),
        );
        if (!end) continue;
        this.climb = {
          time: 0,
          start: p.clone(),
          end,
          height: o.h,
        };
        this.avatar.rotation.y = Math.atan2(direction.x, direction.z);
        this.audio.tone("jump");
        return true;
      }
    }
    return false;
  }
  updateClimb(dt) {
    const c = this.climb;
    c.time += dt;
    const t = Math.min(1, c.time / 0.85),
      ease = t * t * (3 - 2 * t);
    this.player.position.lerpVectors(c.start, c.end, ease);
    this.player.position.y += Math.sin(t * Math.PI) * 0.65;
    this.grounded = false;
    animateExplorer(this, dt, false, false);
    this.nearest = null;
    if (t >= 1) {
      this.jumpY =
        this.player.position.y -
        this.groundHeight(this.player.position.x, this.player.position.z);
      this.fallPeak = this.player.position.y;
      this.airVelocity = null;
      this.velocityY = 0;
      this.grounded = true;
      this.climb = null;
    }
  }
  updateEnemies(dt) {
    updateGuardians(this, dt);
  }
  evade() {
    this.carrying = !!carryingComponent(this.level, this.progress);
    const started = startDodge(this);
    if (started) clearAim(this);
    return started;
  }
  toggleAim() {
    setAim(this, "toggle", !this.aimSources?.has("toggle"));
    this.cb.update?.(this.state());
  }
  toggleCrouch() {
    toggleCrouch(this);
    this.cb.update?.(this.state());
  }
  cameraSpace(p) {
    return galleryAt(this, p.x, p.y, p.z)
      ? galleryClear(this, p.x, p.y, p.z, 0.15, 0.22)
      : this.walkable(p.x, p.z) &&
          cavernClear(this, p.x, p.y, p.z, 0.28) &&
          p.y >=
            Math.max(
              this.groundHeight(p.x, p.z) + 0.28,
              this.swimming && !this.diving
                ? (waterAt(this, p.x, p.z)?.y ?? -Infinity) + 0.12
                : -Infinity,
            );
  }
  restoreCamera(next) {
    const p = this.player.position,
      saved = this.progress.position,
      preferred = (saved && Math.hypot(p.x - saved.x, p.z - saved.z) < 0.25
        ? normalizeCamera(this.progress.camera)
        : null) || {
        yaw: Math.atan2(p.x - next.x * CELL, p.z - next.z * CELL),
        pitch: 0.15,
      },
      target = p.clone().add(new THREE.Vector3(0, this.diving ? 0.3 : 1.3, 0)),
      view = arrivalCamera(
        target,
        preferred,
        this.cameraSurfaces,
        (point) => this.cameraSpace(point),
        this.diving ? 3.4 : 5.3,
      );
    this.yaw = view.yaw;
    this.pitch = view.pitch;
    this.avatar.rotation.y = this.yaw + Math.PI;
    this.avatar.visible = view.length > 0.85;
    this.camera.position.copy(view.position);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }
  updateCamera(dt) {
    if (frameSurveyScope(this)) {
      updateAtmosphere(this, this.player.position);
      return;
    }
    frameCleftCamera(this);
    this.crouchCamera = THREE.MathUtils.damp(
      this.crouchCamera || 0,
      this.crouching ? CROUCH_DROP : 0,
      12,
      dt,
    );
    const blend = (this.aimBlend = THREE.MathUtils.damp(
      this.aimBlend || 0,
      this.aiming && canAim(this) ? 1 : 0,
      12,
      dt,
    ));
    const fov = THREE.MathUtils.lerp(58, 46, blend);
    if (
      this.resonanceFocus == null &&
      this.windFocus == null &&
      this.cipherFocus == null &&
      (this.camera.fov !== fov || this.camera.filmOffset !== 0)
    ) {
      this.camera.fov = fov;
      this.camera.filmOffset = 0;
      this.camera.updateProjectionMatrix();
    }
    if (
      focusObservatory(this) ||
      focusBells(this) ||
      focusHydraulics(this) ||
      focusThermal(this) ||
      focusResonance(this) ||
      focusWind(this) ||
      focusCipher(this)
    ) {
      updateAtmosphere(this, this.player.position);
      return;
    }
    const target = this.player.position
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(this.yaw) * blend * aimShoulder(this.camera),
            this.diving ? 0.3 : 1.3 + blend * 0.18 - this.crouchCamera,
            -Math.sin(this.yaw) * blend * aimShoulder(this.camera),
          ),
        ),
      distance = this.diving ? 3.4 : THREE.MathUtils.lerp(5.3, 2.7, blend);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch) * distance,
      Math.sin(this.pitch) * distance + 0.2 * (1 - blend),
      Math.cos(this.yaw) * Math.cos(this.pitch) * distance,
    );
    const canOccupy = (p) => this.cameraSpace(p);
    // Sweep the lateral shoulder shift as well as the arm behind it.
    if (blend > 0.001) {
      const center = this.player.position.clone().setY(target.y);
      target.copy(
        constrainCamera(center, target, this.cameraSurfaces, canOccupy),
      );
    }
    const desired = target.clone().add(offset);
    this.camera.position.copy(
      followCamera(
        this.camera.position,
        target,
        desired,
        dt,
        this.cameraSurfaces,
        canOccupy,
      ),
    );
    this.avatar.visible = this.camera.position.distanceTo(target) > 0.85;
    this.camera.lookAt(target);
    if (this.aiming)
      this.aimPoint = this.camera
        .getWorldDirection(new THREE.Vector3())
        .multiplyScalar(45)
        .add(this.camera.position);
    updateAtmosphere(this, target);
    updateDiveView(this);
  }
  updateDecorations(dt, observatoryDt = dt, solarDt = dt) {
    updateEchoGallery(this, dt);
    updateFireVault(this, dt);
    updateObservatory(this, observatoryDt);
    updateCaverns(this, dt);
    updateSkyBridges(this, dt);
    syncCounterweights(this, dt);
    updateTempleArchitecture(this);
    updateDesertArchitecture(this);
    updateMonasteryArchitecture(this);
    updatePalaceArchitecture(this);
    updateForgeArchitecture(this, dt);
    updateDesertPalms(this, dt);
    updateRuinGrowth(this);
    updateForest(this, dt);
    updateNature(this, dt);
    updateGroundCover(this, dt);
    for (const patch of this.detailPatches) {
      const radius = patch.boundingSphere.radius;
      const limit =
        (patch.userData.detailRange || 140) *
        ({ low: 0.65, medium: 0.85, high: 1 }[
          this.store.data.settings.quality
        ] || 1);
      patch.visible =
        patch.boundingSphere.center.distanceTo(this.player.position) <
        limit + radius;
    }

    for (const f of this.items) {
      const found = this.progress.found.includes(f.id);
      f.group.visible = !found;
      if (f.type === "mechanism") {
        f.marker.visible = f.stage === this.progress.stage;
        f.core.rotation.y = this.elapsed;
        f.core.visible = f.stage >= this.progress.stage;
      } else if (
        f.core &&
        ![
          "field",
          "solar",
          "bell",
          "hydraulic",
          "thermal",
          "resonator",
          "wind",
          "cipher",
        ].includes(f.type)
      ) {
        f.core.rotation.y = this.elapsed * 0.6;
        f.core.position.y =
          (f.type === "relic" ? 2 : 1) +
          Math.sin(this.elapsed * 2 + f.x) * 0.12;
      }
      f.marker.position.y = 3.4 + Math.sin(this.elapsed * 2) * 0.15;
      f.marker.scale.setScalar(this.sense > 0 ? 2 : 1);
      if (f.type === "relic")
        f.group.visible =
          this.progress.stage >= this.level.mechanisms &&
          !this.progress.completed;
    }
    updateFieldWorld(this, dt);
    updateSolarChambers(this, solarDt);
    updateBellCourts(this, solarDt);
    updateHydraulicCourts(this, solarDt);
    updateThermalCourts(this, solarDt);
    updateResonanceCourts(this, solarDt);
    updateWindCourts(this, solarDt);
    updateCipherCourts(this, solarDt);
    updateWaterSurfaces(this, dt);
    updateTideArchive(this);
    updateSunkenGallery(this, dt);
    updateSoundLandmarks(this);
    this.flames.forEach((f, i) => {
      if (!f.userData.campFire && !f.userData.brazierFire)
        f.scale.y = 1.5 + Math.sin(this.elapsed * 12 + i) * 0.3;
    });
    updateTorch(this);
    updateCamps(this);
    updateBraziers(this, dt);
    updateFireEffects(this);
    this.particles.position.set(
      this.player.position.x,
      this.player.position.y - 4,
      this.player.position.z,
    );
    const p = this.particles.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + (this.level.biome === "snow" ? -1.5 : 0.12) * dt;
      if (y < 0) y = 30;
      if (y > 30) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }
  useTorch() {
    return useTorch(this);
  }
  interact() {
    clearAim(this);
    if (surveyInteract(this)) return;
    if (arcadeInteract(this)) return;
    if (sunInteract(this)) return;
    if (causewayInteract(this)) return;
    if (craneInteract(this)) return;
    if (interactTemperingCart(this)) return;
    if (interactCourier(this)) return;
    if (cleftInteract(this)) return;
    if (pressureInteract(this)) return;
    if (echoInteract(this)) return;
    if (orbitInteract(this)) return;
    if (bellHoistInteract(this)) return;
    if (frozenStairInteract(this)) return;
    if (reflectorInteract(this)) return;
    if (gardenInteract(this)) return;
    if (coralPumpInteract(this)) return;
    if (fireVaultInteract(this)) return;
    if (galleryInteract(this)) return;
    if (archiveInteract(this)) return;
    if (this.diving) return;
    if (cipherInteract(this)) return;
    if (hydraulicInteract(this)) return;
    if (thermalInteract(this)) return;
    if (resonanceInteract(this)) return;
    if (windInteract(this)) return;
    if (bellInteract(this)) return;
    if (solarInteract(this)) return;
    if (counterweightInteract(this)) return;
    if (traversalInteract(this)) return;
    if (!this.nearest) {
      this.cb.toast?.("Move closer to a glowing object to interact.");
      return;
    }
    const f = this.nearest;
    this.keys.clear();
    if (
      f.yOffset &&
      this.player.position.y <
        this.groundHeight(f.x * CELL, f.z * CELL) + f.yOffset - 0.5
    ) {
      this.cb.toast?.(
        f.stairHeight !== undefined
          ? "Climb the west service gallery; the final marker needs the restored stair."
          : "Climb the gilded ledge: move toward it and press Space.",
      );
      return;
    }
    if (f.type === "field") {
      finishFieldTask(this, f);
      this.nearest = null;
      this.cb.update?.(this.state());
    } else if (f.type === "mechanism") {
      if (f.stage !== this.progress.stage) {
        this.cb.toast?.(
          "This mechanism is dormant. Follow the gold marker to your current objective.",
        );
        return;
      }
      if (!fieldComplete(this.level, this.progress)) {
        this.cb.toast?.(
          "Restore this sector’s field stations to open the sanctuary gate.",
        );
        return;
      }
      this.setPaused(true);
      if (!counterweightsReady(this, f)) {
        this.cb.counterweights?.(this.counterweights);
        return;
      }
      this.cb.puzzle?.(f, this.level);
    } else if (f.type === "camp") {
      this.health = 100;
      this.stamina = 100;
      this.progress.medkits = Math.max(3, this.progress.medkits);
      this.checkpoint = {
        x: this.player.position.x,
        z: this.player.position.z,
      };
      this.save();
      this.audio.tone("collect");
      this.cb.toast?.(
        "Base camp · Health restored, supplies replenished, checkpoint saved.",
      );
    } else if (f.type === "relic") {
      if (this.progress.stage < this.level.mechanisms) {
        this.cb.toast?.("Restore every mechanism to release the relic.");
        return;
      }
      this.progress.completed = true;
      this.progress.found.push(f.id);
      this.audio.tone("solve");
      this.save();
      this.setPaused(true);
      this.cb.complete?.(this.level, this.progress);
    } else {
      this.progress.found.push(f.id);
      this.audio.tone("collect");
      if (f.type === "treasure") {
        this.progress.medkits = Math.min(20, this.progress.medkits + 1);
        this.cb.toast?.("Ancient cache recovered · +1 medical supply");
      } else {
        this.setPaused(true);
        this.cb.note?.(f, this.level);
      }
      this.save();
    }
  }
  setHydraulicValues(stage, state, event) {
    return saveHydraulicState(this, stage, state, event);
  }
  setCipherValues(stage, state, event) {
    return saveCipherState(this, stage, state, event);
  }
  setWindValues(stage, state, event) {
    return saveWindState(this, stage, state, event);
  }
  setResonanceValues(stage, state, event) {
    return saveResonanceState(this, stage, state, event);
  }
  setThermalValues(stage, state, event) {
    return saveThermalState(this, stage, state, event);
  }
  setSolarValues(stage, state) {
    return saveSolarState(this, stage, state);
  }
  setBellValues(stage, state) {
    return saveBellState(this, stage, state);
  }
  playBellPhrase(stage, options) {
    return playBellPhrase(this, stage, options);
  }
  stopBellPhrase() {
    cancelBellPlayback(this);
  }
  strikeBell(stage, note) {
    return strikeBell(this, stage, note);
  }
  resetCounterweights() {
    resetCounterweights(this);
  }
  solve(f) {
    if (
      f.stage !== this.progress.stage ||
      !fieldComplete(this.level, this.progress) ||
      !counterweightsReady(this, f)
    )
      return;
    this.progress.stage++;
    this.audio.tone("solve");
    this.checkpoint = { x: this.player.position.x, z: this.player.position.z };
    this.health = Math.min(100, this.health + 20);
    this.save();
    this.cb.toast?.(
      this.progress.stage === this.level.mechanisms
        ? "The sanctum is open. Recover the chapter relic."
        : "Mechanism restored · A new path is calling.",
    );
    this.setPaused(false);
  }
  attack() {
    if (
      this.paused ||
      this.active === false ||
      this.carrying ||
      this.desertSurvey?.focus ||
      this.arcadeLock?.turn ||
      this.sunBridge?.turn ||
      this.shutterHouse?.turn ||
      this.fireVault?.operation ||
      this.pressureRelay?.operation ||
      this.orbitVault?.operation ||
      this.astralCrane?.operating ||
      this.temperingCart?.drive ||
      this.courierFerry?.helm ||
      this.wallGrip ||
      this.blockGrip ||
      this.swimming ||
      this.attackCooldown > 0 ||
      this.dodge ||
      this.climb ||
      this.ropeRide ||
      this.zipRide
    )
      return;
    this.attackCooldown = 0.48;
    this.crouching = false;
    playerNoise(this, 36, "shot");
    this.aimUntil = this.elapsed + 1.4;
    this.aimYaw = this.yaw;
    this.lastShot = this.elapsed;
    if (this.aiming) this.aimPoint = sightline(this).point;
    animateExplorer(this, 0, false, false);
    this.audio.tone("shoot");
    if (this.aiming) {
      const shot = aimedShot(this);
      const hit = shot.target ? hitGuardian(this, shot.target) : null;
      const kind = hit === null ? "miss" : hit ? "hit" : "shield";
      addShotTrace(this, shot.muzzle, shot.point, kind);
      if (hit !== null || shot.cover)
        this.audio.noiseHit?.(
          hit === false ? 0.045 : 0.025,
          0.12,
          hit === false ? 3200 : 950,
          shot.point,
        );
      this.cb.update?.(this.state());
      return;
    }
    const facing = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw),
    );
    let target = null,
      best = 35;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const delta = e.group.position.clone().sub(this.player.position).setY(0);
      const d = delta.length();
      if (
        d < best &&
        delta.normalize().dot(facing) > 0.65 &&
        this.lineOfSight(this.player.position, e.group.position)
      ) {
        best = d;
        target = e;
      }
    }
    if (target) {
      const hit = hitGuardian(this, target);
      target.group.updateWorldMatrix(true, true);
      const impact =
        (hit ? target.core : target.shield)?.getWorldPosition(
          new THREE.Vector3(),
        ) || target.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      addShotTrace(
        this,
        this.rig?.weapon?.muzzle.getWorldPosition(new THREE.Vector3()) ||
          this.player.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
        impact,
        hit ? "hit" : "shield",
      );
    }
  }
  damage(n) {
    if (this.hitTimer > 0 || isEvading(this)) return;
    this.health -= n;
    this.hitTimer = 1;
    this.audio.tone("hurt");
    this.cb.damage?.();
    if (this.health <= 0) {
      leaveSurveyScope(this);
      this.crouching = false;
      this.playerNoises = [];
      clearAim(this);
      this.health = 100;
      resetTraversal(this);
      this.swimming = false;
      resetDiving(this);
      this.grounded = true;
      this.hitTimer = 2.5;
      this.avatar.rotation.x = 0;
      this.avatar.position.y = 0;
      this.player.position.set(
        this.checkpoint.x,
        this.groundHeight(this.checkpoint.x, this.checkpoint.z),
        this.checkpoint.z,
      );
      this.jumpY = 0;
      this.velocityY = 0;
      this.progress.medkits = Math.max(1, this.progress.medkits);
      this.cb.toast?.(
        "You recovered at your last checkpoint. Your discoveries are safe.",
        5000,
      );
      this.save();
    }
  }
  returnToCheckpoint() {
    leaveSurveyScope(this);
    this.crouching = false;
    this.playerNoises = [];
    clearAim(this);
    extinguishTorch(this);
    resetTraversal(this);
    this.swimming = false;
    resetDiving(this);
    this.grounded = true;
    this.jumpY = 0;
    this.player.position.set(
      this.checkpoint.x,
      this.groundHeight(this.checkpoint.x, this.checkpoint.z),
      this.checkpoint.z,
    );
    this.fallPeak = this.player.position.y;
    this.nearest = null;
    this.keys.clear();
    this.health = 100;
    this.save();
  }
  heal() {
    if (this.health >= 100) {
      this.cb.toast?.("Your health is already full.");
      return;
    }
    if (this.progress.medkits <= 0) {
      this.cb.toast?.("No medical supplies. Rest at a base camp.");
      return;
    }
    this.progress.medkits--;
    this.health = Math.min(100, this.health + 55);
    this.audio.tone("collect");
    this.save();
    this.cb.toast?.("Medical supply used · Health restored");
  }
  state() {
    const task = currentFieldTask(this.level, this.progress);
    const mission = EXPEDITIONS[this.level.id][this.progress.stage];
    const opticalTarget =
      solarTarget(this) ||
      bellTarget(this) ||
      hydraulicTarget(this) ||
      thermalTarget(this) ||
      resonanceTarget(this) ||
      windTarget(this) ||
      cipherTarget(this);
    const objectiveTarget = this.progress.completed
      ? null
      : this.items.find((f) => f.id === task?.id) ||
        opticalTarget ||
        this.items.find(
          (f) => f.type === "mechanism" && f.stage === this.progress.stage,
        ) ||
        this.items.find((f) => f.type === "relic");
    const aimedTarget =
      objectiveTarget &&
      hasCounterweights(objectiveTarget) &&
      counterweightsReady(this, objectiveTarget)
        ? { ...objectiveTarget, z: objectiveTarget.z - 5 / CELL }
        : objectiveTarget;
    const gallery = galleryObjective(this);
    const vault = fireVaultObjective(this);
    const hoist = bellHoistObjective(this);
    const causeway = causewayObjective(this);
    const crane = craneObjective(this);
    const reflector = reflectorObjective(this);
    const stair = frozenStairObjective(this);
    const pump = coralPumpObjective(this);
    const cleft = cleftObjective(this);
    const pressure = pressureObjective(this);
    const echo = echoObjective(this);
    const orbit = orbitObjective(this);
    const courier = courierObjective(this);
    const target =
      hoist || cleft || pressure || echo || orbit || courier
        ? null
        : crane?.target ||
          reflector?.target ||
          pump?.target ||
          stair?.target ||
          vault?.target ||
          (this.diving || gallery ? null : traversalTarget(this, aimedTarget));
    return {
      health: this.health,
      stamina: this.stamina,
      aim: aimState(this),
      stealth: stealthState(this),
      windBraced:
        (!!this.skyWind?.braced && Math.abs(this.skyWind.force) > 0.05) ||
        (!!this.shutterWind?.braced && Math.abs(this.shutterWind.force) > 0.05),
      swimming: this.swimming,
      torch: this.torch ? this.progress.torch === true : null,
      diving: this.diving,
      diveAir: this.diveAir ?? DIVE_AIR,
      archive:
        this.level.biome === "water" ? archiveProgress(this).length : null,
      gallery: !!gallery,
      fireVault: vault,
      causeway,
      desertSurvey: surveyObjective(this),
      arcadeLock: arcadeObjective(this),
      sunBridge: sunObjective(this),
      shutterHouse: shutterObjective(this),
      bellHoist: hoist,
      cleft,
      pressure,
      echo,
      orbit,
      courier,
      galleryStage: this.progress.gallery?.recovered
        ? 2
        : this.progress.gallery?.opened
          ? 1
          : 0,
      medkits: this.progress.medkits,
      stage: this.progress.stage,
      total: this.level.mechanisms,
      objective:
        causeway?.text ||
        crane?.text ||
        reflector?.text ||
        pump?.text ||
        stair?.text ||
        courier?.text ||
        orbit?.text ||
        echo?.text ||
        pressure?.text ||
        cleft?.text ||
        hoist?.text ||
        vault?.text ||
        gallery ||
        (this.diving
          ? "Explore the tidekeeper’s submerged archive"
          : this.progress.completed
            ? "Expedition complete · Find the remaining discoveries"
            : task?.label ||
              (this.progress.stage === 0 &&
              this.counterweights &&
              !this.counterweights.saved.solved
                ? `Restore the counterweights · ${this.counterweights.trial.title}`
                : null) ||
              (opticalTarget
                ? opticalTarget.type === "cipher"
                  ? "Read the covenant and align its carved drums"
                  : opticalTarget.type === "wind"
                    ? "Guide the wind to the engine’s receiver"
                    : opticalTarget.type === "resonator"
                      ? "Tune the array and recover its memory"
                      : opticalTarget.type === "thermal"
                        ? "Match the regulator’s firing record"
                        : opticalTarget.type === "hydraulic"
                          ? "Match the royal measure in the hydraulic court"
                          : opticalTarget.type === "bell"
                            ? "Learn and answer the bellkeeper's lesson"
                            : opticalTarget.kind === "receiver"
                              ? "Activate the illuminated receiver"
                              : "Follow and redirect the sunlight"
                : null) ||
              this.level.objectiveNames[this.progress.stage] ||
              `Recover ${this.level.artifact}`),
      mission,
      fieldTask: task,
      carrying: carryingComponent(this.level, this.progress),
      distance: target
        ? Math.round(
            Math.hypot(
              target.x * CELL - this.player.position.x,
              target.z * CELL - this.player.position.z,
            ),
          )
        : 0,
      nearest: this.nearest,
      traversalHint: this.bellSites?.[this.progress.stage]?.playback
        ? (() => {
            const play = this.bellSites[this.progress.stage].playback;
            return {
              key: "♫",
              label:
                play.active < 0
                  ? "Listen to the bells…"
                  : `LISTEN · ${play.active + 1} / ${play.notes.length} · ${this.level.symbols[play.notes[play.active]]}`,
            };
          })()
        : surveyHint(this) ||
          arcadeHint(this) ||
          sunHint(this) ||
          shutterHint(this) ||
          causewayHint(this) ||
          craneHint(this) ||
          cartHint(this) ||
          courierHint(this) ||
          orbitHint(this) ||
          echoHint(this) ||
          pressureHint(this) ||
          cleftHint(this) ||
          bellHoistHint(this) ||
          reflectorHint(this) ||
          gardenHint(this) ||
          frozenStairHint(this) ||
          coralPumpHint(this) ||
          fireVaultHint(this) ||
          torchHint(this) ||
          galleryHint(this) ||
          counterweightHint(this) ||
          traversalHint(this) ||
          skyBridgeHint(this) ||
          archiveHint(this) ||
          divingHint(this),
      position: this.player.position,
      yaw: this.yaw,
      time: this.progress.time,
      sense: this.sense,
      target,
      notes: this.progress.found.filter((x) => x.startsWith("note")).length,
      treasures: this.progress.found.filter((x) => x.startsWith("treasure"))
        .length,
    };
  }
  updateAudio() {
    updateSoundSources(this);
    this.audio.update(this.player.position, this.yaw, {
      stage: this.progress.stage,
      underwater: this.diving,
      listenerHeight: this.swimming ? 0.3 : this.crouching ? 1.2 : 1.6,
      task: this.desertSurvey?.focus
        ? "survey"
        : this.arcadeLock?.turn || this.sunBridge?.turn
          ? "winch"
          : arcadeObjective(this) || sunObjective(this)
            ? "climb"
            : this.shutterHouse?.turn
              ? "winch"
              : this.shutterWind
                ? "crosswind"
                : causewayObjective(this)
                  ? "resonance"
                  : coralPumpObjective(this)
                    ? "valve"
                    : this.astralCrane?.operating ||
                        this.frozenStair?.motion ||
                        this.easternReflector?.motion ||
                        this.temperingCart?.drive ||
                        this.temperingCart?.turn ||
                        this.rainGarden?.motion
                      ? "lift"
                      : courierObjective(this)
                        ? "crosswind"
                        : orbitObjective(this)
                          ? "lift"
                          : echoObjective(this)
                            ? "tuning"
                            : pressureObjective(this)
                              ? "lift"
                              : cleftObjective(this)
                                ? this.wallGrip
                                  ? "climb"
                                  : "survey"
                                : bellHoistObjective(this)
                                  ? this.bellHoist.motion
                                    ? "lift"
                                    : "resonance"
                                  : fireVaultObjective(this)
                                    ? this.fireVault.operation
                                      ? "lift"
                                      : "brazier"
                                    : this.diving || galleryObjective(this)
                                      ? "dive"
                                      : (this.nearest?.type === "resonator" ||
                                            this.resonanceFocus != null) &&
                                          resonanceReady(
                                            this,
                                            this.resonanceSites?.[
                                              this.progress.stage
                                            ],
                                          )
                                        ? "tuning"
                                        : this.hydraulicSites?.[
                                              this.progress.stage
                                            ]?.flow ||
                                            this.thermalSites?.[
                                              this.progress.stage
                                            ]?.moving ||
                                            this.windSites?.[
                                              this.progress.stage
                                            ]?.moving
                                          ? "valve"
                                          : this.blockGrip ||
                                              this.cipherSites?.[
                                                this.progress.stage
                                              ]?.moving
                                            ? "lift"
                                            : this.skyWind
                                              ? "crosswind"
                                              : this.ropeRide || this.zipRide
                                                ? "climb"
                                                : currentFieldTask(
                                                    this.level,
                                                    this.progress,
                                                  )?.kind || "mechanism",
      danger:
        !this.paused &&
        this.enemies.some(
          (e) =>
            e.hp > 0 &&
            guardianEngaged(e) &&
            this.elapsed - e.lastSeen < 8 &&
            e.group.position.distanceTo(this.player.position) < 24,
        ),
      sourceActive: (source) =>
        source.vaultFire !== undefined
          ? source.vaultFire === "entry" ||
            this.progress.fireVault?.lit.includes(source.vaultFire)
          : source.hazard
            ? this.hazards.some(
                (h) =>
                  h.id === source.hazard && !h.disabled && h.phase === "active",
              )
            : source.field
              ? this.progress.field.includes(source.field) ||
                source.stage < this.progress.stage
              : !source.mechanism || source.stage <= this.progress.stage,
      occluded: (source) =>
        !this.lineOfSight(
          this.swimming
            ? this.player.position.clone().add(new THREE.Vector3(0, -1.1, 0))
            : this.player.position,
          new THREE.Vector3(source.x, source.y - 1.4, source.z),
        ),
    });
  }
  save() {
    if (this.preparing) return;
    if (!this.progress || !this.player) return;
    this.progress.health = this.health;
    this.progress.explored = [...this.explored];
    const hoistPosition =
      surveySavePosition(this) ||
      arcadeSavePosition(this) ||
      sunSavePosition(this) ||
      shutterSavePosition(this) ||
      causewaySavePosition(this) ||
      cartSavePosition(this) ||
      gardenSavePosition(this) ||
      courierSavePosition(this) ||
      orbitSavePosition(this) ||
      pressureSavePosition(this) ||
      cleftSavePosition(this) ||
      hoistSavePosition(this);
    const settledPosition =
      hoistPosition || this.blockGrip?.move?.playerFrom || this.player.position;
    this.progress.position = {
      x: settledPosition.x,
      z: settledPosition.z,
      height: hoistPosition
        ? hoistPosition.y - this.groundHeight(hoistPosition.x, hoistPosition.z)
        : this.grounded
          ? this.jumpY
          : 0,
    };
    this.progress.traversal = captureTraversal(this);
    this.progress.camera = normalizeCamera({
      yaw: this.yaw,
      pitch: this.pitch,
    });
    this.progress.checkpoint = this.checkpoint;
    captureGallery(this);
    this.progress.lastPlayed = Date.now();
    this.store.save();
    this.cb.saved?.();
  }
  setPaused(value) {
    if (value) {
      leaveSurveyScope(this);
      clearAim(this);
      this.dragging = false;
      this.lookTouch = null;
      cancelBellPlayback(this);
      settleHydraulics(this);
      settleThermal(this);
      settleResonance(this);
      settleWind(this);
      settleCipher(this);
    }
    this.paused = value;
    updateAstralCrane(this, 0);
    updateEchoCauseway(this, 0);
    updateOrbitVault(this, 0);
    updateCartArt(this);
    updateCourierArt(this);
    updateEchoGallery(this, 0);
    updateFireVault(this, 0);
    updateBellHoist(this, 0);
    updateFrozenStair(this, 0);
    updateDesertSurvey(this, 0);
    updateArcadeLock(this, 0);
    updateSunBridge(this, 0);
    updateShutterHouse(this, 0);
    updateEasternReflector(this, 0);
    updateRainGarden(this, 0);
    updateCoralPump(this, 0);
    updatePressureRelay(this, 0);
    updateCleftArt(this);
    if (value) silenceCableMotion(this);
    updateTorch(this);
    this.presentationRemaining = 0;
    this.audio.setMode(value ? "pause" : "explore");
    this.renderOnce = true;
    this.keys.clear();
    this.touchMove = { x: 0, z: 0 };
    if (value) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.save();
    } else {
      this.clock.getDelta();
      this.audio.resume();
    }
  }
  stop() {
    this.save();
    this.setPaused(true);
    this.active = false;
    this.audio.pause();
  }
  applySettings() {
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.store.data.settings.quality === "high" ? 1.75 : 1,
      ),
    );
    const shadows = this.store.data.settings.quality !== "low";
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.renderer.shadowMap.needsUpdate = true;
      // Three.js does not invalidate existing programs just because the global
      // shadow toggle changed. Receivers need the matching shader variant.
      const materials = new Set();
      this.scene?.traverse((object) => {
        if (object.material)
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((material) => materials.add(material));
      });
      materials.forEach((material) => {
        material.needsUpdate = true;
      });
    }
    configureSunShadow(this);
    this.cinematic?.configure();
    this.audio.setMix(this.store.data.settings);
    this.audio.setVolume(
      this.store.data.settings.muted ? 0 : this.store.data.settings.volume,
    );
  }
}
