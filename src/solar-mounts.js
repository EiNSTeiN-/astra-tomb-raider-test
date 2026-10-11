import * as THREE from "three";

// The wheel sits to the side of the vertical mirror spindle. A cast housing
// and horizontal axle connect it to that spindle; the hub turns with the rim.
export function addSolarWheelMount(game, group, wheel, material) {
  wheel.userData.cameraDynamic = true;
  const casting = (profile, parent, x, y, z, axis) => {
    const geometry = new THREE.LatheGeometry(
      profile.map(([radius, along]) => new THREE.Vector2(radius, along)),
      24,
    );
    if (axis === "x") geometry.rotateZ(-Math.PI / 2);
    if (axis === "z") geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    game.cameraSurfaces?.capture(mesh, { small: true, cylinderAxis: axis });
  };
  casting(
    [
      [0, -0.32],
      [0.27, -0.32],
      [0.33, -0.25],
      [0.33, 0.21],
      [0.27, 0.28],
      [0, 0.28],
    ],
    group,
    0,
    1.03,
    0,
    "y",
  );
  casting(
    [
      [0, 0.18],
      [0.19, 0.18],
      [0.22, 0.23],
      [0.22, 0.34],
      [0.16, 0.43],
      [0.075, 0.47],
      [0.075, 0.86],
      [0.12, 0.86],
      [0.12, 0.94],
      [0.075, 0.96],
      [0.075, 1.09],
      [0, 1.09],
    ],
    group,
    0,
    1.03,
    0,
    "x",
  );
  casting(
    [
      [0, -0.09],
      [0.13, -0.09],
      [0.15, -0.06],
      [0.15, 0.045],
      [0.12, 0.075],
      [0.08, 0.075],
      [0.08, 0.095],
      [0, 0.095],
    ],
    wheel,
    0,
    0,
    0,
    "z",
  );
  // Keep the rim's open sectors: a single box or filled cylinder would turn
  // its empty centre into opaque metal. These short tangential bounds follow
  // the rotating wheel, and leave with its scene. Proxies are never rendered.
  if (game.cameraSurfaces) {
    const { radius, tube } = wheel.geometry.parameters,
      segments = 12,
      half = Math.PI / segments,
      inner = (radius - tube) * Math.cos(half),
      outer = radius + tube,
      centre = (inner + outer) / 2;
    for (let i = 0; i < segments; i++) {
      const angle = ((i + 0.5) * Math.PI * 2) / segments,
        geometry = new THREE.BoxGeometry(
          2 * outer * Math.sin(half),
          outer - inner,
          2 * tube,
        ),
        proxy = new THREE.Mesh(geometry, material);
      proxy.position.set(Math.sin(angle) * centre, Math.cos(angle) * centre, 0);
      proxy.rotation.z = -angle;
      wheel.add(proxy);
      game.cameraSurfaces.capture(proxy, { small: true, thin: true });
      wheel.remove(proxy);
      geometry.dispose();
    }
  }
}
