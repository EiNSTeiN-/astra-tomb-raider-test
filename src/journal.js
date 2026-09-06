// Optional, chapter-specific discoveries. These are fictional expedition journals.
const entries = {
  verdant: [
    [
      "The first threshold",
      "The coordinates ended at an ordinary riverbank. Then I noticed every tree leaning away from the same patch of ground. The forest knew there was a doorway here long before I did.",
    ],
    [
      "A patient language",
      "The inscription distinguishes between opening a door and being allowed through it. I have spent my life translating dead languages. This is the first one that seems to be translating me.",
    ],
    [
      "Keeper of the gate",
      "The stone figures are listening to footsteps. When I stopped, the nearest one stopped with me. Distance gives you time to think. The builders appear to have valued that.",
    ],
    [
      "Rain in the walls",
      "Water is running inside a wall with no pipe and no visible joint. The garden is part of the mechanism. Pulling out its roots would destroy the very thing I came to understand.",
    ],
    [
      "In the margins",
      "Vesper, you will be furious when you read this. Be furious. It is a sensible response to what I have done. But please keep reading until you know why. — Mum",
    ],
    [
      "An unexpected connection",
      "The stone came from this valley. The curve carved into it did not. I drew that same curve in a desert notebook six years ago and dismissed it as a copying error.",
    ],
    [
      "The sun bridge",
      "The bridge has two counterweights: one for the stones, another for the people walking over them. This place was built for visitors. Something later taught it to be afraid.",
    ],
    [
      "A reason to return",
      "There is a café beside the river where Vesper insists the pastries are too small. We always order three. I have written its name on every supply list, as if it were another necessary piece of equipment.",
    ],
    [
      "The knot",
      "I repaired the handline with the knot Dad taught me and I taught Vesper. Three generations in one small loop of rope. I hope the next person through recognizes it.",
    ],
    [
      "The quiet machine",
      "The gate, the garden, the lens and the shrine are not separate inventions. They are instruments playing different parts of the same piece. The compass moves when they agree.",
    ],
    [
      "The green needle",
      "The compass needle has split into two shadows. One points toward the temple. The other points west, through the earth, as though the world were a folded sheet of paper.",
    ],
    [
      "To whoever follows",
      "I left the sun seal where it can be reached without opening the heart gate. Take the time to look. The way forward is rarely the only thing worth finding. — Elara Vale",
    ],
  ],
  sands: [
    [
      "Beneath the wind line",
      "The dunes have changed since my last visit. The survey stones have not. Their tops seem to rise by exactly the amount of new sand. I am beginning to dislike the word impossible.",
    ],
    [
      "The false door",
      "A splendid doorway faces the sunrise. Behind it is solid rock. The actual entrance is a maintenance hatch facing away from the wind. Even a forgotten city needs practical people.",
    ],
    [
      "Dawn in a cup",
      "A broken mirror still gathers the first sunlight into a hollow no wider than my thumb. The bronze around it is cool. The sun inside it is not.",
    ],
    [
      "The cooling river",
      "The aqueduct carries water only while the mirrors are moving. Its engravings show a hand beside a warning: light has weight. I would like to meet the engineer who wrote that.",
    ],
    [
      "A terrible noon",
      "The noon reflector is blackened along one edge. Someone stood in front of it with a bronze shield while their companions escaped. Their footprints survived beneath the fallen frame.",
    ],
    [
      "The city that buried itself",
      "The doors were sealed from within, then covered carefully. This was not a disaster the city failed to prevent. It was a decision. I do not yet know whether to admire it.",
    ],
    [
      "One cold room",
      "In the sepulcher, my water bottle gathered condensation. Outside, the sand scorched through my gloves. The entire mirror network seems to be cooling a room no one is supposed to enter.",
    ],
    [
      "A different map",
      "The star chart has our familiar constellations around the edge. At the center are seven marks that belong to no sky I know. One is the exact shape of the jungle compass.",
    ],
    [
      "The repair crew",
      "I found a wooden lunch spoon in the relay housing. It made the whole city briefly ordinary. Someone fixed this machine, ate something disappointing, and went home.",
    ],
    [
      "A letter never sent",
      "I nearly turned back today. I imagined explaining all this to Vesper over coffee, keeping the difficult parts out until she noticed. She always notices.",
    ],
    [
      "The eye of noon",
      "The relic does not reflect my face. It reflects the doorway behind me, including a person who is not standing there. I have covered it with a cloth for the night.",
    ],
    [
      "The road north",
      "A snowflake formed on the cloth covering the Eye. I am in a desert. The seven marks are places, and the next one is calling from very high up.",
    ],
  ],
  frost: [
    [
      "No footprints",
      "The lantern at the pass was lit when I arrived. There are no tracks approaching it and the snow has been falling for days. I thanked whoever left it anyway.",
    ],
    [
      "The pilgrim handline",
      "The trail is older than every repair made to it. Each traveler replaced one short section. No one person could maintain the whole ascent. Everyone could maintain enough for the next.",
    ],
    [
      "A bell without a clapper",
      "The valley bell swings in complete silence. Its clapper has been wrapped in felt and stored below the shelter mark. A note says the mountain needed to sleep.",
    ],
    [
      "Words under ice",
      "The prayer stones are weather records. Wind, pressure, snowfall, a dangerous crack in the western stair. Faith and careful observation were never enemies here.",
    ],
    [
      "The keeper’s ledger",
      "The bellkeeper recorded the name of every traveler who crossed the pass. The last pages are blank except for one entry in another hand: someone will come for us.",
    ],
    [
      "The frozen stair",
      "Ice filled the lift bearings. The manual suggests warming them with a cup of tea. I had imagined more spectacular solutions to an ancient machine. The tea worked.",
    ],
    [
      "The bell of names",
      "I sounded the memorial bell once. For a moment the snowfall looked like people walking between the buildings. I wrote this down before I could persuade myself otherwise.",
    ],
    [
      "A sheltered voice",
      "Close the shutters and the wind chamber holds the smallest sound. A whisper travels around it for almost a minute. I said my daughter’s name and waited until it stopped returning.",
    ],
    [
      "Above the clouds",
      "The summit tower is lower than the highest mountain, but standing on it makes the mountains feel like islands. The chime points at an ocean I cannot see.",
    ],
    [
      "The promise seal",
      "The library seal is engraved with two hands passing a lantern. The accompanying text offers no reward for returning it. Some promises do not require a bargain.",
    ],
    [
      "The silent library",
      "There are no books. Every shelf holds a bell of a different shape. When the Winter Chime rings, the shelves answer. I could spend a lifetime learning how to listen.",
    ],
    [
      "What the lantern means",
      "I have relit the pass lantern and left the repaired clapper in place. If Vesper follows, I want her first discovery to be that someone expected her to arrive.",
    ],
  ],
  tides: [
    [
      "The returning shore",
      "The tide withdrew while I watched, revealing steps under the boat. Fish waited in the pools between them. The city did not look abandoned. It looked interrupted.",
    ],
    [
      "Harbor marks",
      "The mooring stones have marks for ships far larger than this harbor could contain. Unless the water once continued into the space behind the sealed gate.",
    ],
    [
      "The harbor’s lungs",
      "The pumps breathe. Intake, pressure, release, a pause. I copied the rhythm and found the same intervals in the monastery’s bells. Water is another way of writing music.",
    ],
    [
      "Coral machinery",
      "The coral has grown around the pump without touching its moving parts. Centuries of growth have respected clearances measured in millimeters. Something has been maintaining this place.",
    ],
    [
      "A calendar of absence",
      "The tidal calendar marks a day that happens only when seven distant events coincide. I have already caused three of them. This is the first moment I have been afraid of succeeding.",
    ],
    [
      "The reflecting pool",
      "When the lower court drained, a mosaic appeared. It shows a woman carrying water uphill while stars pour out of her bucket. The face is worn away. The determination is unmistakable.",
    ],
    [
      "The sunken arcade",
      "Shops line the arcade. A cobbler’s sign survived beside a doorway into the royal machinery. The people who knew this city lived ordinary lives around its extraordinary heart.",
    ],
    [
      "The queen’s reservoir",
      "The royal reservoir has no private outlet. Every carved channel feeds a public fountain. The title on the central valve translates most closely as the person responsible for the water.",
    ],
    [
      "Pressure",
      "I opened the wrong relief valve and a crack traveled across the vault door. Closing it stopped the crack. I have circled the correct order three times in my notebook.",
    ],
    [
      "A glimpse below",
      "There is another city reflected beneath the dark water. Its lights move in the wind, though the water is completely still. I can see a figure looking up.",
    ],
    [
      "The pearl of tides",
      "The pearl is warm and faintly uneven, like a stone held in someone’s hand. Inside it, a tiny tide rises and falls. It has begun matching my breathing.",
    ],
    [
      "An engine of fire",
      "The next mark is hot enough to singe the page. I am leaving the wet notebooks here to dry. Vesper used to complain that every story I told ended just before the interesting part.",
    ],
  ],
  embers: [
    [
      "The warm wall",
      "The first wall was warm. The second was humming. At the third I took my hand away because the vibration had begun moving up my arm in time with my pulse.",
    ],
    [
      "A forge, not a tomb",
      "No burials, no offerings, no names of rulers. Only tools, measuring marks, and safety instructions. We keep calling these places temples because it is easier than admitting we do not understand the machinery.",
    ],
    [
      "Cold air",
      "The cooling intake draws air from somewhere that smells of snow. There is no connection to the surface. I held the Winter Chime beside it and heard a bell ring very far away.",
    ],
    [
      "The first furnace",
      "The ignition core is small enough to carry, heavy enough to make every step a decision. Its cradle fits the curvature of two human hands. The designers expected someone to do this alone.",
    ],
    [
      "Pressure relief",
      "The relief diagram shows three vents and a person standing well back. Some instructions need no translation. I stood considerably farther back than the carving recommended.",
    ],
    [
      "Obsidian gears",
      "Volcanic glass should not survive this kind of load. These gears have been turning for longer than the language on their housings has existed. Their teeth show no wear.",
    ],
    [
      "Rivers in the walls",
      "I followed a channel carrying molten metal into a room with no exit. The metal returned cooled, carrying a pattern that had not been there before. Something on the other side is making parts.",
    ],
    [
      "The firekeeper",
      "A small plaque thanks the person who relit the pilot flames. It offers a bench and drinking water. Even here, at the heart of a mountain, hospitality has a place.",
    ],
    [
      "The shape of a key",
      "The key blank bends light along its edges. I saw my hand in a position it had occupied a second earlier. I put it down until my own hand caught up.",
    ],
    [
      "A machine with a purpose",
      "The forge does not power the threshold. It repairs it. Every furnace, every channel, every gear exists to keep a door from closing. Who is it being held open for?",
    ],
    [
      "The ember heart",
      "The heart fits against the compass as if the two were broken from the same object. Their combined weight is less than either alone. I checked the scales twice.",
    ],
    [
      "A sudden breath",
      "When I opened the final cooling circuit, the hot air smelled of wet leaves and cold clouds. The next place is not below me. It is somewhere above the weather.",
    ],
  ],
  sky: [
    [
      "Impossible, twice",
      "Impossible. I wrote the word, underlined it, then underlined it again. The city hangs between ridges with no support I can identify. I have since crossed its first handline.",
    ],
    [
      "The cloud forest",
      "The roots grip stone that moves gently in the wind. Birds land on the railings without hesitation. I am trying to borrow some of their confidence.",
    ],
    [
      "The weatherkeeper",
      "The weather station measures wind from directions that do not appear on a compass. Its most frequent reading is translated as returning. I have left space in my notebook for a better word.",
    ],
    [
      "The balance weight",
      "The vane weight is carved in the shape of a feather. Carry it into the wind and it grows heavier. Carry it away and it almost leaves your hand.",
    ],
    [
      "The first crossing",
      "The suspension drums must be wound from the fixed bank outward. I found that instruction after trying the reverse order. The resulting noise will remain with me for a long time.",
    ],
    [
      "An eagle’s view",
      "The eagle tablets are maps intended to be read from above. Climbing to the next one reveals that the platform I just left is itself another part of the drawing.",
    ],
    [
      "A pendulum of air",
      "The observatory’s stone pendulum does not swing with gravity. It swings toward the next point in the route. Standing beneath it feels like standing under a question.",
    ],
    [
      "The western span",
      "The western cable was slackened on purpose. On the hidden side of its locking pin I found a warning from a traveler who turned back. They were wiser than I am, or knew something I do not.",
    ],
    [
      "A place to sit",
      "There is a bench at the upper wind station, facing the sunrise. I stayed for longer than my schedule allowed. Vesper would have stayed longer still and been right to do so.",
    ],
    [
      "The summit catch",
      "The emergency catch is newer than the rest of the machinery. Someone repaired it with a material I cannot scratch. They left no name, only the familiar lantern mark.",
    ],
    [
      "The feather of stone",
      "The relic is perfectly ordinary until I close my eyes. Then I feel a direction opening beneath my feet. The others are quieter when it is near them.",
    ],
    [
      "Toward the dark",
      "The city’s instruments point down at a forest that has never seen the sun. I should be tired of impossible places by now. Instead I find myself wondering what the next one sounds like.",
    ],
  ],
  crystal: [
    [
      "No echo",
      "The cave swallowed the sound of my boots. Then a crystal beside the entrance repeated it. One footstep, exact in every detail, several seconds after I had stopped moving.",
    ],
    [
      "The first guide",
      "A faint carved line connects the guide crystals. Sound them along the line and they brighten. Reverse it and they dim. The entrance seems designed to teach this before you need to know it.",
    ],
    [
      "A tuning shard",
      "The shard resonates against my teeth while I carry it. I found myself humming a tune I have not heard since Vesper was small. It stopped the moment I set the shard down.",
    ],
    [
      "The luminous archive",
      "The crystal faces contain moving images. People carrying lamps, repairing a gate, sitting together over a meal. This is an archive of lives, not achievements.",
    ],
    [
      "The index",
      "The archive does not arrange memories by year. It arranges them by the feeling with which they were remembered. I found the same room under hope and regret.",
    ],
    [
      "The echo chamber",
      "My voice returned sounding older. I asked another question and it returned sounding frightened. I have decided to work without speaking for a while.",
    ],
    [
      "Violet",
      "The violet array holds a memory of this cavern before the crystals grew. A team of workers is planting the first small shards. One stops to look directly toward the reading station.",
    ],
    [
      "The first witness",
      "A recorded voice says there must always be a way back. Another says the return route costs more than the outward journey. I cannot make out what they mean by cost.",
    ],
    [
      "The second witness",
      "The threshold requires a memory strong enough to hold two places together. The travelers in the recording offer maps and measurements. Nothing happens until one of them speaks a name.",
    ],
    [
      "The third witness",
      "I said Vesper’s name. Every crystal in the chamber answered. I finally understand what the compass has been following, and I wish I had understood it before leaving home.",
    ],
    [
      "The memory prism",
      "The prism holds the afternoon we taught Vesper the handline knot. She was impatient with the rope, then so pleased when it held. I can hear the river. I can almost touch her hand.",
    ],
    [
      "The return marker",
      "If she follows me, the prism will know her. I am leaving its focusing crown outside the reliquary. One last practical kindness before a journey for which I have no practical advice.",
    ],
  ],
  eclipse: [
    [
      "A place between",
      "The sky is wrong by a small, terrible amount. Stars appear through daylight. The compass points toward every gate at once. I do not think this place is under the earth.",
    ],
    [
      "The meeting of roads",
      "Each threshold opens onto a different expedition. I can smell jungle rain beside desert dust. A monastery bell sounds from an empty archway. Distance has become a matter of attention.",
    ],
    [
      "The earthly axis",
      "The balancing stone carries the weight of the place it came from. I thought that was a metaphor until I tried to lift it without first turning the survey mark toward home.",
    ],
    [
      "The lunar crown",
      "The moon inside the orrery has a scar across its far side. The one above the court has the same scar. I am no longer certain which is the model.",
    ],
    [
      "The sevenfold archive",
      "Seven ways of seeing: direction, light, sound, tide, fire, wind, memory. None is enough by itself. Together they describe a place a human being might survive entering.",
    ],
    [
      "The last sunlight",
      "Relighting the solar beacon cast two shadows behind me. One moved when I did. The other turned toward the western horizon and waited.",
    ],
    [
      "The horizon gate",
      "Beyond the gate is a riverbank I recognize. The trees are smaller. For a moment I thought the threshold had returned me to an earlier day. Then I saw the unopened café across the water.",
    ],
    [
      "The astral spindle",
      "The spindle aligns places that might have been with places that are. The builders did not discover another world. They discovered how close all the possible worlds are to ours.",
    ],
    [
      "The answering song",
      "Every instrument is playing now. Beneath them I can hear an ordinary sound: a kettle coming to the boil. I have never wanted anything more than to find the room it is in.",
    ],
    [
      "The hollow chamber",
      "The return route is held by the memory in the prism. It is not a sacrifice. It is a promise that someone on each side will remember the same place. I think we can do that.",
    ],
    [
      "A coat by the door",
      "Vesper always leaves her coat on the wrong hook. I used to move it, then stopped. A home should have evidence that its people are actually living there. I have missed that coat more than I can explain.",
    ],
    [
      "The final message",
      "Vesper. I have left the compass where you can find it. If you are reading this, you have done something extraordinary and I owe you several explanations. Come through when you are ready. The kettle is on. — Mum",
    ],
  ],
};

export const JOURNAL = entries;
export function readNote(levelId, index) {
  return (
    entries[levelId]?.[index] || [
      "An unreadable page",
      "The ink on this page has faded.",
    ]
  );
}
