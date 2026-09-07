export const GALLERY_RECORD = {
  title: "The names of the living",
  text: "The copper roll lists no kings and records no treasure. It names every boat that left the harbor, its keeper, and the families aboard. Beside the last boat, someone pressed a small hand into the sealing clay. The tidekeepers did not build this chamber to preserve their kingdom's wealth. They built it to prove that its people had escaped.",
  note: "Vesper's note: Mother searched these ruins for an entrance to the Hollow Earth. I keep finding reasons people chose to return to the surface.",
};

export const GALLERY_ROOMS = [
  "entrance",
  "turning-passage",
  "first-bell-room",
  "colonnade",
  "cross-gallery",
  "second-bell-room",
  "archive-neck",
  "memorial",
  "return-passage",
];

export function normalizeGallery(value) {
  return {
    opened: value?.opened === true,
    recovered: value?.opened === true && value?.recovered === true,
    rest: ["bell-a", "bell-b"].includes(value?.rest) ? value.rest : "entry",
    resume: value?.resume === true,
    visited: [
      ...new Set(
        Array.isArray(value?.visited)
          ? value.visited.filter((id) => GALLERY_ROOMS.includes(id))
          : [],
      ),
    ],
  };
}
