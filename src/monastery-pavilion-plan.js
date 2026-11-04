// Fictional court-specific volumes. The eave lines retain the established
// bearing frame; changing the pitch, ridge and upper aspect changes the actual
// skyline and the fitted house beneath it, rather than adding surface motifs.
const FORMS = [
  ["Pilgrim hall", "hip", 3.3, "hip", 10.2, 8.2, 2.4],
  ["Echo gable", "gable", 3.9, "gable", 10.2, 8.2, 3.2],
  ["Listening lantern", "pavilion", 3.1, "pavilion", 9.6, 8.6, 3.9],
  ["Stair hall", "gable", 3, "hip", 11.4, 7.8, 2.7],
  ["Open memory pavilion", "hip", 2.25, null],
  ["Woven-wind hall", "hip", 3.45, "gable", 10.2, 8.6, 2.7],
  ["Summit beacon", "pavilion", 3.85, "pavilion", 8.9, 7.6, 4.8],
  ["Archive longhouse", "gable", 2.6, "gable", 11.4, 8.2, 2.05],
  ["Bell observatory", "pavilion", 4.1, "pavilion", 10, 9, 4.8],
];

export function monasteryPavilionPlan(index) {
  const [name, profile, rise, upperProfile, width, depth, upperRise] =
    FORMS[index % FORMS.length];
  return {
    name,
    main: { width: 17.4, depth: 12.4, rise, profile },
    upper: upperProfile
      ? { width, depth, rise: upperRise, profile: upperProfile }
      : null,
  };
}
