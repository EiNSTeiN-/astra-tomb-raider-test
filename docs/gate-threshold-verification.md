# Gate panels and standing footing

The all-chapter gate test now distinguishes a raised panel's obstruction from
the terrain clearance required by a standing body. The previous test asked
every point in a nine-sample threshold grid to permit a grounded standing pose,
including steep banks and excavated coastal beds. That assumption predates the
standing-body terrain guard.

The original failure is the third jungle gate's left entrance sample, at
world `(67, 196.2)`. Its rendered ground is 0.801816 m high. Within the
standing body's corner margin, terrain rises 0.742640 m above that root;
the footing guard allows 0.6 m. The raised gate clears the point, while
ordinary standing movement rejects it. The adjacent sample at local
`(-3, +6.5)` and the center at `(0, +7.2)` remain clear.

A diagnostic survey of all 621 threshold samples finds eighteen standing
rejections, all explained by terrain clearance: three jungle left-bank samples
at stages 2, 4 and 6, and fifteen coastal left-side samples at stages 0, 2, 4,
6 and 8. All 621 clear the raised-panel/map obstruction. All 207 center-passage
samples retain the normal 1.8 m standing-clearance query. No movement, terrain,
water, architecture or save behavior is changed by this test correction.

The public test retains the locked-gate check, regional geometry and camera
checks, and all nine restored threshold queries per gate. Those nine queries
use zero body clearance to isolate floor-level panel/map obstruction. Three
additional center queries per gate use the ordinary standing-body predicate.
A separate regression retains the original jungle point, independently
measures its steep corner, requires standing movement to reject it and verifies
the two adjacent clear approaches. This would fail if the footing guard were
removed or loosened beyond the measured bank.

All sixteen final cases in `tests/sanctuary-gates.test.js` pass in 71.419
seconds with one worker. They also cover sealed walls, foundations, camera
bounds, hinged leaves, drive states and saved restoration. The two vault cases
passed separately against the same unchanged application code. The complete
campaign test suite is not rerun for this test-only correction.

The [vault milestone](crystal-vaults.md) records the original 79-of-80 result
and its baseline reproduction. This investigation resolves that test's
incorrect standing assumption. It does not grade the banks, certify every
side approach or demonstrate an unassisted campaign playthrough. Wider visual
and continuous-route acceptance remain open.

Verification uses the shared CPU guard, one test worker and local ignored
staging. The production application is byte-for-byte unchanged from the
verified vault build, so its keyboard/High and touch/Low puzzle, input and
three-reload checks remain applicable. No browser or server is needed for
this test-only correction.
