// Authored field work precedes each sanctuary puzzle. The order is intentional:
// every recovered component has a destination and every route has a consequence.
const chapters = {
  verdant: [
    [
      "The listening grove",
      "The sun gate has lost its fire. Read the keeper’s trail, then light your torch at a campfire with T / Torch and carry its flame to both braziers. Swimming puts it out.",
      "Read the keeper’s trail|Light the root shrine|Kindle the sanctuary beacon",
      "Fire travels along the old channels. The outer sanctuary answers.",
    ],
    [
      "Roots of the city",
      "A counterweight lies where the forest swallowed the gatehouse. Carry it back through the roots.",
      "Recover the bronze counterweight|Inspect the broken pulley|Seat the gatehouse weight",
      "Stone settles beneath the roots. A passage opens through the gatehouse.",
    ],
    [
      "The rain garden",
      "The temple’s reservoirs are dry. Open the spring before releasing the garden’s two lower channels.",
      "Release the hillside spring|Open the garden channel|Turn the sanctuary sluice",
      "Water runs through the garden for the first time in centuries.",
    ],
    [
      "The keeper’s vigil",
      "Three watch stations record a single sunrise. Reach their inscriptions in the order the light once touched them.",
      "Read the dawn lookout|Climb to the canopy tablet|Trace the keeper’s final mark",
      "The three observations reveal the missing part of the keeper’s dial.",
    ],
    [
      "The fallen sun",
      "The eastern altar was dismantled deliberately. One surviving lens can restore its light.",
      "Lift the amber lens|Survey the eastern plinth|Install the altar lens",
      "A shaft of amber light cuts through the canopy.",
    ],
    [
      "The hanging garden",
      "The sun bridge is held by three ancient winches. Follow their cables from the garden to the sanctuary.",
      "Tension the garden cable|Raise the crossing support|Release the bridge winch",
      "The suspended gate settles onto its supports.",
    ],
    [
      "A thousand small lights",
      "Carry a torch flame from a camp or a burning brazier through the inner beacon chain. Keep to dry paths: swimming puts it out. Each lit beacon becomes a place to relight.",
      "Light the outer brazier|Light the raincourt brazier|Light the inner beacon",
      "The courtyard glows. Beyond it, the heart temple is awake.",
    ],
    [
      "What she left behind",
      "Elara left the final sun seal outside the temple, where another traveler could reach it.",
      "Recover Elara’s sun seal|Read her last trail marker|Return the seal to the heart gate",
      "The heart gate opens. Your mother’s compass is finally still.",
    ],
  ],
  sands: [
    [
      "A door in the dunes",
      "The visible entrance is a decoy. Three survey marks describe a buried doorway below the wind line.",
      "Read the survey obelisk|Find the lee-side inscription|Mark the buried threshold",
      "The survey lines meet at the entrance to the buried city.",
    ],
    [
      "The dawn collectors",
      "The dawn reflector is missing its silvered face. Transport the surviving lens from the excavation.",
      "Recover the dawn lens|Inspect the receiver mount|Install the dawn reflector",
      "The first light well fills with reflected sunlight.",
    ],
    [
      "The dry river",
      "An aqueduct once cooled the mirrors. Its intake and both pressure controls are still intact.",
      "Open the aqueduct intake|Bleed the western pressure valve|Release the cooling channel",
      "The western aqueduct clears the grit from its ancient bearings.",
    ],
    [
      "White noon",
      "Noon light is too intense for the cracked glass. Fit a bronze filter before aligning the mirror.",
      "Lift the bronze light filter|Read the scorch pattern|Fit the noon filter",
      "The dangerous white glare softens into a narrow gold beam.",
    ],
    [
      "The astronomer’s roof",
      "The desert ephemeris was copied onto raised observation stations. The highest record survived the sand.",
      "Climb the first survey tower|Read the southern star mark|Climb to the ephemeris tablet",
      "A calendar emerges from the three observation points.",
    ],
    [
      "The eastern shadow",
      "Brace the fallen reflector, climb its timber back and jump to the rear gallery to release the locking pin. Descend by the west service platforms, use the hauling wheel, then cross beneath the raised mirror to the eastern threshold.",
      "Brace the fallen reflector|Release the rear locking pin|Cross the eastern threshold",
      "The eastern reflector lifts clear of the chamber entrance.",
    ],
    [
      "The light beneath",
      "The central light well contains three shutters. Open them from the deepest branch outward.",
      "Unlatch the lower shutter|Unlatch the middle shutter|Raise the light-well crown",
      "Sunlight reaches the lower city. Dust drifts like gold.",
    ],
    [
      "A city of mirrors",
      "The circuit needs a final relay. Carry the relay through the old maintenance route to the solar hub.",
      "Recover the solar relay|Survey the maintenance inscription|Connect the solar hub",
      "The separate mirrors become one continuous circuit.",
    ],
    [
      "The last cool room",
      "The sepulcher has no handle. Its builders left a sequence of witness marks outside the sealed chamber.",
      "Read the mark of dawn|Read the mark of dusk|Sound the sepulcher’s witness stone",
      "The last door withdraws from a room untouched by the desert.",
    ],
  ],
  frost: [
    [
      "The broken pilgrim trail",
      "The path above the pass has lost its handlines. Restore the anchors before attempting the bell platform.",
      "Secure the lower trail anchor|Climb to the ridge anchor|Tension the pilgrim handline",
      "The handline draws taut across the abandoned pass.",
    ],
    [
      "A voice in the valley",
      "The valley bell’s clapper fell into the snow. Return it by the sheltered service trail.",
      "Recover the valley clapper|Find the bellkeeper’s shelter mark|Install the valley clapper",
      "The bell finds its voice. A second bell answers far above.",
    ],
    [
      "Words in white",
      "Snow buried the prayer stones at different heights. Read their exposed faces from the climbing stations.",
      "Read the lower prayer stone|Climb to the windward prayer|Read the sheltered prayer",
      "The prayers describe a route through the frozen monastery.",
    ],
    [
      "The frozen stair",
      "The stair is raised against its hauling frame. Free the lower lock, climb the west service gallery and jump its broken span to reach the upper lock. Return to the hauling wheel, lower the stair, then climb to the pass marker.",
      "Free the lower stair lock|Release the upper gallery lock|Cross the restored stair",
      "The pass marker records a safe crossing. The frozen sanctuary doors swing free.",
    ],
    [
      "The bell of names",
      "A memorial bell was carried away from the storm. Its clapper waits beside the keeper’s last ledger.",
      "Lift the memorial clapper|Read the bellkeeper’s ledger|Restore the bell of names",
      "The memorial bell is whole again. Every name can be heard.",
    ],
    [
      "The room of wind",
      "Wind shutters protect the chamber’s resonator. The controls are scattered across exposed watchposts.",
      "Climb to the western shutter|Close the ridge shutter|Secure the chamber shutter",
      "The gale falls silent inside the chamber.",
    ],
    [
      "Above the clouds",
      "The summit bell has three climbing anchors. Follow the last ascent made by the monastery’s keepers.",
      "Climb the lower summit tower|Tension the high anchor|Climb the summit signal tower",
      "The summit station looks out above a sea of cloud.",
    ],
    [
      "The library without a key",
      "A bronze promise seal belongs in the silent library. Carry it from the memorial court to the final door.",
      "Recover the promise seal|Read the final pilgrim marker|Place the seal at the library",
      "The library opens to the sound of all eight bells.",
    ],
  ],
  tides: [
    [
      "The returning shore",
      "The causeway is emerging, but trapped seawater still seals the harbor gate. Release its three controls.",
      "Open the shore drain|Release the causeway valve|Lower the harbor spillway",
      "Water retreats from the harbor threshold.",
    ],
    [
      "The harbor’s lungs",
      "The harbor sluice draws pressure from an inland reservoir. Start at the intake and work toward the sea.",
      "Open the reservoir intake|Bleed the harbor pressure line|Release the seaward sluice",
      "The harbor drains through a channel cut beneath the tide.",
    ],
    [
      "A machine of coral",
      "Carry the bronze impeller to the coral pump after reading the pumpkeeper’s diagram. Seat the rotor, open the intake at least halfway and adjust the bypass until the gauge holds between its gold ticks. Steady pressure restores the flow.",
      "Recover the pump impeller|Read the pumpkeeper’s diagram|Restore flow through the coral pump",
      "The old pump turns, shedding centuries of salt.",
    ],
    [
      "The moon’s ledger",
      "Tidal records survived above the flood line. Reach the high tablets and read the low-water mark.",
      "Climb to the lunar tablet|Read the low-water gauge|Climb to the tidekeeper’s calendar",
      "The calendar names the one tide that can open the royal court.",
    ],
    [
      "Under the reflecting pool",
      "The lower court is held underwater by a pressure loop. Isolate its intake before draining it.",
      "Close the court intake|Vent the trapped pressure|Open the lower court drain",
      "The reflecting pool drops and exposes the royal approach.",
    ],
    [
      "The sunken arcade",
      "The arcade’s doors share a cable drive. Wind the supports in order to pull its shattered entrance open.",
      "Tension the arcade support|Raise the flooded counterweight|Winch the arcade gate clear",
      "The arcade doors swing clear of the dark water.",
    ],
    [
      "The queen’s reservoir",
      "A second reservoir feeds the royal sluice. Empty the branches before opening the central control.",
      "Release the garden reservoir|Release the fountain reservoir|Open the royal sluice",
      "The royal reservoir gives up the water it has guarded for centuries.",
    ],
    [
      "The equal sea",
      "Too much pressure will shatter the vault. Balance the three relief stations before using its controls.",
      "Bleed the western pressure station|Bleed the eastern pressure station|Set the vault pressure relief",
      "The pressure gauges settle. The vault can be approached.",
    ],
    [
      "The abyssal lock",
      "The vault’s removable axle was hidden above the water. Carry it down through the newly drained city.",
      "Recover the abyssal lock axle|Read the vault engineer’s mark|Install the final lock axle",
      "The last sluice falls quiet. The royal vault stands open.",
    ],
  ],
  embers: [
    [
      "A breath of cold air",
      "The forge cannot be entered while its exhaust feeds the approach. Reroute its cooling circuit.",
      "Open the cold-air intake|Release the first pressure vent|Direct the cooling conduit",
      "Cold air moves into the outer forge.",
    ],
    [
      "The dormant furnace",
      "A missing ignition core keeps the first furnace dark. Its carrier cradle lies outside the hot zone.",
      "Lift the ignition core|Inspect the furnace feed|Seat the first ignition core",
      "The first furnace catches with a deep orange glow.",
    ],
    [
      "The pressure of stone",
      "The mountain is pressing against the engine. Open its relief valves from the outer vent inward.",
      "Vent the outer exhaust|Vent the fracture chamber|Open the central pressure relief",
      "A column of steam escapes. The engine’s rhythm slows.",
    ],
    [
      "Black glass",
      "The obsidian gears cannot turn without their hub. Retrieve it from the abandoned repair station.",
      "Recover the obsidian hub|Read the repair station diagram|Fit the obsidian gear hub",
      "The gears move through their first complete revolution.",
    ],
    [
      "Rivers in the walls",
      "The smelting channels have crossed their feeds. Set the three control valves before lighting the forge.",
      "Isolate the ash channel|Open the iron channel|Balance the smelting feed",
      "The channels carry a steady flow toward the forge.",
    ],
    [
      "An eternal fire",
      "Three pilot flames remain. Rekindle them along the old firekeeper’s route.",
      "Light the ash-house pilot|Light the iron-house pilot|Ignite the eternal forge",
      "The forge awakens. Its light reaches the caldera walls.",
    ],
    [
      "The shape of a key",
      "A blank of volcanic glass must reach the tempering station intact. Follow the shielded route.",
      "Lift the obsidian key blank|Inspect the cooling bath|Place the key in the tempering cradle",
      "The glass cools around a pattern older than the forge.",
    ],
    [
      "The machine beneath",
      "The engine must be cooled before the key can turn. Its final three valves release the trapped heat.",
      "Open the engine jacket valve|Vent the heart chamber|Release the final cooling circuit",
      "The heart engine falls into a slow, steady pulse.",
    ],
  ],
  sky: [
    [
      "A stair of leaves",
      "The cloud forest hides the lower city. Reach the two lookout anchors and secure a route through.",
      "Climb the forest lookout|Secure the lower city anchor|Tension the cloud-forest handline",
      "The lower city appears between the clouds.",
    ],
    [
      "The language of weather",
      "The lower vane has lost its balance weight. Carry it from the sheltered workshop to the wind station.",
      "Recover the vane balance weight|Read the weatherkeeper’s scale|Install the lower vane weight",
      "The vane turns freely into the prevailing wind.",
    ],
    [
      "The first impossible bridge",
      "The first crossing hangs from three cable drums. Work from the fixed bank toward the suspended gate.",
      "Wind the fixed-bank drum|Tension the middle suspension|Release the crossing winch",
      "The suspended doors swing into line with the crossing.",
    ],
    [
      "The eagle’s path",
      "Carved eagles mark the city’s high route. Their tablets can only be reached from the lookout towers.",
      "Climb to the first eagle tablet|Read the leeward eagle mark|Climb to the upper eagle tablet",
      "The carvings trace a safe path along the ridgeline.",
    ],
    [
      "An observatory of air",
      "The observatory uses a stone pendulum to measure the wind. Return the pendulum from its storage cradle.",
      "Lift the observatory pendulum|Inspect the suspension mount|Install the mountain pendulum",
      "The pendulum settles along a line pointing beyond the mountains.",
    ],
    [
      "The western span",
      "The western crossing's cable was deliberately slackened. Restore the anchors and haul the gate clear.",
      "Secure the western anchor|Tension the valley cable|Winch the western crossing open",
      "The western doors swing open above the cloud line.",
    ],
    [
      "The wind above the wind",
      "The upper vane's controls are on separate signal towers. Climb to each one before attempting the final alignment.",
      "Climb the south signal tower|Set the high wind brake|Climb the upper vane tower",
      "The upper vane answers the lower one across the city.",
    ],
    [
      "The summit suspension",
      "The summit gate is held by its emergency catch. Draw its doors inward using the three surviving supports.",
      "Tension the summit support|Release the emergency catch|Open the summit gate",
      "The final crossing is clear.",
    ],
    [
      "A feather that weighs a world",
      "The skyward altar is missing its eagle seal. Carry it from the last lookout to the city's highest shrine.",
      "Recover the stone eagle seal|Read the last lookout marker|Return the seal to the skyward altar",
      "The altar opens its wings to the wind.",
    ],
  ],
  crystal: [
    [
      "A light underground",
      "The hollow has no sunlight. Wake the guide crystals in the order their carved lines describe.",
      "Sound the entrance crystal|Sound the lower guide crystal|Wake the hollow beacon",
      "A line of pale light reaches into the earth.",
    ],
    [
      "The first remembered voice",
      "The first resonator needs a tuning shard. Carry the shard along the marked acoustic trail.",
      "Recover the tuning shard|Read the acoustic trail marker|Seat the first resonator shard",
      "A voice almost forms inside the resonator.",
    ],
    [
      "An archive made of light",
      "The archive stores its records in elevated crystal faces. Reach their reading stations to recover the index.",
      "Climb to the lower archive lens|Read the luminous index|Climb to the archive crown",
      "The archive remembers a traveler with your mother's voice.",
    ],
    [
      "The echo that returns",
      "The echo chamber has three relay stones. Sound them from the outer gallery toward the sealed door.",
      "Sound the outer relay|Sound the gallery relay|Wake the echo chamber relay",
      "The echo returns along a path no living person has mapped.",
    ],
    [
      "The violet forest",
      "The violet array is missing its conductor. Its core lies beyond the old survey station.",
      "Lift the violet conductor|Survey the fractured array|Install the violet core",
      "The crystal forest pulses in a single violet wave.",
    ],
    [
      "A sleeping memory",
      "Three witness crystals contain fragments of one conversation. Wake them in the order the expedition found them.",
      "Wake the first witness crystal|Wake the second witness crystal|Sound the memory keeper",
      "A woman's voice says your name. The recording is twenty years old.",
    ],
    [
      "The heart's frequency",
      "The heart resonator is fed from three high reading stations. Follow the climb through the crystal canopy.",
      "Climb the low resonance tower|Tune the middle feed|Climb the heart resonance tower",
      "The heart resonator vibrates at the frequency of an open door.",
    ],
    [
      "A memory to carry",
      "The memory prism needs its focusing crown. Carry the last surviving piece from the archive to the reliquary.",
      "Recover the focusing crown|Read Elara's return marker|Fit the prism crown",
      "The reliquary opens. For a moment, you hear footsteps beside your own.",
    ],
  ],
  eclipse: [
    [
      "The meeting of roads",
      "The meridian court carries marks from every expedition. Read the three oldest to locate its entrance.",
      "Read the earthly witness|Read the lunar witness|Read the solar witness",
      "The court recognizes the route you have taken.",
    ],
    [
      "The weight of the earth",
      "The earthly axis needs its balancing stone. Carry it along the marked route to the first celestial engine.",
      "Lift the earthly balance stone|Inspect the axis bearing|Seat the earthly counterweight",
      "The earthly axis turns toward a place beneath every horizon.",
    ],
    [
      "The moon's shadow",
      "The lunar orrery is locked by three shutters. Follow their control stations around the shadowed court.",
      "Release the lower lunar shutter|Open the eclipse shutter|Raise the lunar crown",
      "Moonlight reaches the orrery through the eclipsed sky.",
    ],
    [
      "Seven ways of seeing",
      "The sevenfold archive keeps its index above the court. Climb its stations to read the route between worlds.",
      "Climb the archive's first tower|Read the sevenfold index|Climb the archive's crown",
      "Seven routes meet at an eighth place that has no name.",
    ],
    [
      "The last sunlight",
      "The solar axis has no fire. Rekindle the witness beacons left by travelers before you.",
      "Light the eastern witness|Light the western witness|Kindle the solar axis beacon",
      "A ring of fire outlines the darkened sun.",
    ],
    [
      "The western horizon",
      "Three winches hold the horizon doors. Open them in the same order as the city in the clouds.",
      "Tension the horizon support|Release the meridian catch|Open the western horizon gate",
      "The western horizon opens onto a sky you have never seen.",
    ],
    [
      "The distance between stars",
      "A star-metal spindle belongs inside the astral orrery. Its weight resists every step toward the axis.",
      "Recover the astral spindle|Survey the star-metal socket|Install the astral spindle",
      "The orrery charts the distance between this world and the next.",
    ],
    [
      "The answering song",
      "The celestial circuit has three witness resonators. Their sequence repeats the song beneath the crystal forest.",
      "Sound the earthly resonator|Sound the lunar resonator|Wake the celestial circuit",
      "The instruments of eight civilizations answer together.",
    ],
    [
      "The hollow earth",
      "The threshold is under enormous pressure. Release its three controls before turning the final alignment.",
      "Vent the outer threshold|Balance the hollow chamber|Release the meridian pressure gate",
      "The threshold becomes quiet. There is room for one traveler.",
    ],
    [
      "A reason to return",
      "A familiar compass rests beside the final route marker. Carry it to the door your mother left open.",
      "Recover Elara's compass|Read her final message|Place the compass at the last meridian",
      "From beyond the door, a familiar voice asks whether you brought your coat.",
    ],
  ],
};

const patterns = {
  verdant: ["sbb", "lsd", "vvv", "scs", "lsd", "www", "bbb", "lsd"],
  sands: ["sss", "lsd", "vvv", "lsd", "csc", "wws", "www", "lsd", "ssr"],
  frost: ["wcw", "lsd", "scs", "wws", "lsd", "cww", "cwc", "lsd"],
  tides: ["vvv", "vvv", "lsd", "csc", "vvv", "www", "vvv", "vvv", "lsd"],
  embers: ["vvv", "lsd", "vvv", "lsd", "vvv", "bbb", "lsd", "vvv"],
  sky: ["cww", "lsd", "www", "csc", "lsd", "www", "cwc", "www", "lsd"],
  crystal: ["rrr", "lsd", "csc", "rrr", "lsd", "rrr", "crc", "lsd"],
  eclipse: [
    "sss",
    "lsd",
    "www",
    "csc",
    "bbb",
    "www",
    "lsd",
    "rrr",
    "vvv",
    "lsd",
  ],
};
const kinds = {
  s: "survey",
  b: "brazier",
  l: "lift",
  d: "delivery",
  v: "valve",
  c: "climb",
  w: "winch",
  r: "resonance",
};

export const EXPEDITIONS = Object.fromEntries(
  Object.entries(chapters).map(([id, rows]) => [
    id,
    rows.map(([place, briefing, labels, aftermath], stage) => ({
      place,
      briefing,
      aftermath,
      tasks: labels.split("|").map((label, step) => ({
        id: `field-${stage}-${step}`,
        label,
        kind: kinds[patterns[id][stage][step]],
        stage,
        step,
      })),
    })),
  ]),
);

export function fieldComplete(level, progress, stage = progress.stage) {
  if (stage < progress.stage) return true;
  const mission = EXPEDITIONS[level.id]?.[stage];
  return !mission || mission.tasks.every((t) => progress.field?.includes(t.id));
}

export function currentFieldTask(level, progress) {
  if (progress.completed) return null;
  return (
    EXPEDITIONS[level.id]?.[progress.stage]?.tasks.find(
      (t) => !progress.field?.includes(t.id),
    ) || null
  );
}

export function carryingComponent(level, progress) {
  if (
    level.id === "tides" &&
    progress.stage === 2 &&
    progress.coralPump?.installed
  )
    return false;
  const mission = EXPEDITIONS[level.id]?.[progress.stage];
  return (
    !!mission?.tasks.some(
      (t) => t.kind === "lift" && progress.field?.includes(t.id),
    ) &&
    !mission.tasks.some(
      (t) => t.kind === "delivery" && progress.field?.includes(t.id),
    )
  );
}
