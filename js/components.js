/* ===== WATER ANIMATION ===== */
AFRAME.registerComponent('water-animation', {
  schema: { speed: { default: 2 }, amplitude: { default: 0.1 } },
  init: function () {
    this.time = 0;
    // Wait for mesh to load if attached to primitive
    this.el.addEventListener('loaded', () => {
      var mesh = this.el.getObject3D('mesh');
      if (mesh) this.setupWater(mesh);
    });
    // Or if already loaded
    if (this.el.getObject3D('mesh')) this.setupWater(this.el.getObject3D('mesh'));
  },
  setupWater: function (mesh) {
    if (!mesh || !mesh.geometry) return;
    // Create new detailed geometry for waves (12x8 to match pool)
    mesh.geometry = new THREE.PlaneGeometry(12, 8, 60, 40);
    // Do NOT rotate geometry here, let HTML rotation="-90 0 0" handle orientation
    this.geo = mesh.geometry;
    this.origZ = [];
    var pos = this.geo.attributes.position;
    for (var i = 0; i < pos.count; i++) this.origZ.push(pos.getZ(i));
  },
  tick: function (t, dt) {
    if (!this.geo) return;
    this.time += dt * 0.001;
    var pos = this.geo.attributes.position;
    var s = this.data.speed, a = this.data.amplitude;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      // Modify Z (which is Up/Down in local space for an XY plane)
      // When plane is rotated -90 X, local Z becomes World Y (Up)
      pos.setZ(i, this.origZ[i] + Math.sin(x * 2 + this.time * s) * a + Math.cos(y * 3 + this.time * s * 0.7) * a * 0.6);
    }
    pos.needsUpdate = true;
  }
});

/* ===== FLOATING BALL ===== */
AFRAME.registerComponent('floating-ball', {
  schema: { speed: { default: 2 }, amplitude: { default: 0.1 } },
  init: function () {
    this.time = 0;
    this.initialY = this.el.object3D.position.y;
  },
  tick: function (t, dt) {
    if (!dt) return;
    this.time += dt * 0.001;
    var pos = this.el.object3D.position;
    // Calculate wave offset using same formula as water-animation
    // Using local coordinates relative to pool center
    var s = this.data.speed, a = this.data.amplitude;
    var x = pos.x;
    var y = -pos.z; // Plane local Y is world -Z due to rotation
    var offset = Math.sin(x * 2 + this.time * s) * a + Math.cos(y * 3 + this.time * s * 0.7) * a * 0.6;
    this.el.object3D.position.y = this.initialY + offset;
  }
});

/* ===== FAN SPIN ===== */
AFRAME.registerComponent('fan-spin', {
  schema: { speed: { default: 25 } },
  tick: function (t, dt) {
    this.el.object3D.rotation.y += this.data.speed * dt * 0.001;
  }
});

/* ===== DOOR TOGGLE ===== */
/* ===== AUTO DOORS (Proximity) ===== */
AFRAME.registerComponent('door-auto', {
  schema: {
    dist: { default: 2.5 }, // Trigger distance
    type: { default: 'rotate' }, // 'rotate', 'slide', 'gate'
    axis: { default: 'y' }, // 'y' for rotate, 'x' for slide
    dir: { default: 1 }, // 1 or -1
    speed: { default: 2 }
  },
  init: function () {
    this.player = document.querySelector('[camera]') || document.querySelector('a-scene').camera.el;
    this.isOpen = false;
    this.origPos = this.el.object3D.position.clone();
    this.origRot = this.el.object3D.rotation.clone();
  },
  tick: function (t, dt) {
    if (!this.player) return;

    // Check distance (use world position for accuracy)
    var pPos = this.player.object3D.position;
    var ePos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(ePos);

    // Calculate horizontal distance
    var d = Math.sqrt(Math.pow(pPos.x - ePos.x, 2) + Math.pow(pPos.z - ePos.z, 2));

    var shouldOpen = d < this.data.dist;

    // Animate
    var factor = dt * 0.005 * this.data.speed;

    if (this.data.type === 'slide') {
      // Slide along X (+/-)
      // Target: origPos + (dir * 0.9m)
      var targetX = this.origPos.x + (shouldOpen ? this.data.dir * 1.5 : 0);
      var currX = this.el.object3D.position.x;
      var diff = targetX - currX;
      if (Math.abs(diff) > 0.01) {
        this.el.object3D.position.x += diff * factor;
      }
    } else {
      // Rotate (Door or Gate)
      // Target: origRot + 90deg * dir
      var targetRot = this.origRot[this.data.axis] + (shouldOpen ? this.data.dir * Math.PI / 2 : 0);
      var currRot = this.el.object3D.rotation[this.data.axis];
      var diff = targetRot - currRot;
      if (Math.abs(diff) > 0.01) {
        this.el.object3D.rotation[this.data.axis] += diff * factor;
      }
    }
  }
});

/* ===== DOG WALK (Enhanced Collision Avoidance) ===== */
AFRAME.registerComponent('dog-walk', {
  schema: { speed: { default: 1.5 }, color: { default: '#C4956A' } },
  init: function () {
    // Compound is now 60x60 (x: -30 to 30, z: -30 to 30)
    // Front yard roaming zone: x [-28, 28], z [8.5, 28]
    // Avoid: Pool, Garage, House, and Trees
    this.avoidZones = [
      { minX: 9.5, maxX: 22.5, minZ: 10.5, maxZ: 19.5 }, // NEW Pool region (at 16, 0, 15)
      { minX: -30, maxX: -14, minZ: -5, maxZ: 5 }, // Side Garage region
      { minX: -12.5, maxX: 12.5, minZ: -10, maxZ: 8.5 }, // House region
      // Trees (Approx 1.5m radius avoid zones)
      { minX: 16.5, maxX: 19.5, minZ: -16.5, maxZ: -13.5 },
      { minX: -19.5, maxX: -16.5, minZ: 13.5, maxZ: 16.5 },
      { minX: -19.5, maxX: -16.5, minZ: -13.5, maxZ: -10.5 },
      { minX: 16.5, maxX: 19.5, minZ: 3.5, maxZ: 6.5 },
      { minX: 4.5, maxX: 7.5, minZ: 20.5, maxZ: 23.5 }, // New position for Tree 5 (6, 0, 22)
      { minX: -11.5, maxX: -8.5, minZ: 16.5, maxZ: 19.5 }
    ];
    this.newWaypoint();
    this.pos = this.el.object3D.position.clone();
  },
  newWaypoint: function () {
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 50) {
      this.target = new THREE.Vector3(
        (Math.random() * 56) - 28, // x: -28 to 28
        0,
        (Math.random() * 18) + 10   // z: 10 to 28 (Front yard optimized)
      );
      valid = true;
      for (let zone of this.avoidZones) {
        if (this.target.x > zone.minX && this.target.x < zone.maxX &&
          this.target.z > zone.minZ && this.target.z < zone.maxZ) {
          valid = false;
          break;
        }
      }
      attempts++;
    }
  },
  checkCollision: function (x, z) {
    for (let zone of this.avoidZones) {
      if (x > zone.minX && x < zone.maxX && z > zone.minZ && z < zone.maxZ) {
        return true;
      }
    }
    // Boundary check for compound walls and villa walls
    if (x > 29 || x < -29 || z > 29 || z < 9) return true; // Keep in front yard
    return false;
  },
  tick: function (t, dt) {
    if (!dt) return;
    var dir = this.target.clone().sub(this.pos);
    var dist = dir.length();

    if (dist < 0.5) {
      this.newWaypoint();
      return;
    }

    dir.normalize();
    var stepSize = this.data.speed * dt * 0.001;
    var nextX = this.pos.x + dir.x * stepSize;
    var nextZ = this.pos.z + dir.z * stepSize;

    if (this.checkCollision(nextX, nextZ)) {
      this.newWaypoint();
      return;
    }

    this.pos.x = nextX;
    this.pos.z = nextZ;
    this.el.object3D.position.copy(this.pos);
    this.el.object3D.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
  }
});

/* ===== DOG CHASE (Fast Chasing Logic) ===== */
AFRAME.registerComponent('dog-chase', {
  schema: { speed: { default: 6 }, isFollower: { default: false }, targetDog: { type: 'selector' } },
  init: function () {
    this.pos = this.el.object3D.position.clone();
    this.waypoint = new THREE.Vector3();
    this.avoidZones = [
      { minX: 9.5, maxX: 22.5, minZ: 10.5, maxZ: 19.5 }, // Pool region
      { minX: -30, maxX: -14, minZ: -5, maxZ: 5 }, // Side Garage region
      { minX: -12.5, maxX: 12.5, minZ: -10, maxZ: 8.5 }, // House region
      { minX: 16.5, maxX: 19.5, minZ: -16.5, maxZ: -13.5 },
      { minX: -19.5, maxX: -16.5, minZ: 13.5, maxZ: 16.5 },
      { minX: -19.5, maxX: -16.5, minZ: -13.5, maxZ: -10.5 },
      { minX: 16.5, maxX: 19.5, minZ: 3.5, maxZ: 6.5 },
      { minX: 4.5, maxX: 7.5, minZ: 20.5, maxZ: 23.5 }, // New position for Tree 5 (6, 0, 22)
      { minX: -11.5, maxX: -8.5, minZ: 16.5, maxZ: 19.5 }
    ];
    this.newChaseWaypoint();
  },
  newChaseWaypoint: function () {
    let valid = false;
    let attempts = 0;
    while (!valid && attempts < 50) {
      this.waypoint.set((Math.random() * 56) - 28, 0, (Math.random() * 18) + 10);
      valid = true;
      for (let zone of this.avoidZones) {
        if (this.waypoint.x > zone.minX && this.waypoint.x < zone.maxX &&
          this.waypoint.z > zone.minZ && this.waypoint.z < zone.maxZ) {
          valid = false;
          break;
        }
      }
      attempts++;
    }
  },
  checkCollision: function (x, z) {
    for (let zone of this.avoidZones) {
      if (x > zone.minX && x < zone.maxX && z > zone.minZ && z < zone.maxZ) {
        return true;
      }
    }
    if (x > 29 || x < -29 || z > 29 || z < 9) return true;
    return false;
  },
  tick: function (t, dt) {
    if (!dt) return;
    let targetPos;
    if (this.data.isFollower && this.data.targetDog) {
      targetPos = this.data.targetDog.object3D.position;
    } else {
      targetPos = this.waypoint;
    }

    let dir = targetPos.clone().sub(this.pos);
    let dist = dir.length();

    if (dist < 1.5) {
      if (!this.data.isFollower) this.newChaseWaypoint();
      return;
    }

    dir.normalize();
    let multi = this.data.isFollower ? 1.1 : 1.0;
    let stepSize = this.data.speed * multi * dt * 0.001;
    var nextX = this.pos.x + dir.x * stepSize;
    var nextZ = this.pos.z + dir.z * stepSize;

    if (this.checkCollision(nextX, nextZ)) {
      if (!this.data.isFollower) {
        this.newChaseWaypoint();
      } else {
        return;
      }
      return;
    }

    this.pos.x = nextX;
    this.pos.z = nextZ;
    this.el.object3D.position.copy(this.pos);
    this.el.object3D.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
  }
});

/* ===== BIRD FLY ===== */
AFRAME.registerComponent('bird-fly', {
  schema: { speed: { default: 2 } },
  init: function () {
    this.newWaypoint();
    this.pos = this.el.object3D.position.clone();
  },
  newWaypoint: function () {
    this.target = new THREE.Vector3(
      (Math.random() * 100) - 50,
      (Math.random() * 10) + 15, // Height 15-25m
      (Math.random() * 100) - 50
    );
  },
  tick: function (t, dt) {
    if (!dt) return;
    var dir = this.target.clone().sub(this.pos);
    var dist = dir.length();
    if (dist < 1) {
      this.newWaypoint();
      return;
    }
    dir.normalize();
    var step = (this.data.speed + Math.random()) * dt * 0.001 * 2;
    this.pos.add(dir.multiplyScalar(Math.min(step, dist)));
    this.el.object3D.position.copy(this.pos);
    this.el.object3D.rotation.y = Math.atan2(dir.x, dir.z);
  }
});

/* ===== DOG LEG ANIMATION ===== */
AFRAME.registerComponent('dog-legs', {
  schema: { speed: { default: 8 }, angle: { default: 0.5 } },
  init: function () { this.time = 0; },
  tick: function (t, dt) {
    this.time += dt * 0.001;
    var legs = this.el.querySelectorAll('.dog-leg');
    for (var i = 0; i < legs.length; i++) {
      var offset = i < 2 ? 0 : Math.PI;
      var swing = Math.sin(this.time * this.data.speed + offset + (i % 2) * Math.PI) * this.data.angle;
      legs[i].object3D.rotation.x = swing;
    }
  }
});

/* ===== DOG TAIL WAG ===== */
AFRAME.registerComponent('tail-wag', {
  tick: function (t) {
    this.el.object3D.rotation.z = Math.sin(t * 0.008) * 0.4;
  }
});

/* ===== SWITCHES & CONTROLS ===== */

// Toggle Switch: Works by emitting events and toggling visual state
AFRAME.registerComponent('switch-toggle', {
  schema: {
    target: { type: 'selector' },
    type: { type: 'string', default: 'fan' } // 'fan' or 'light'
  },
  init: function () {
    this.isActive = true;
    this.el.classList.add('clickable');

    // Create visual lever
    var lever = document.createElement('a-box');
    lever.setAttribute('color', '#333');
    lever.setAttribute('width', '0.04');
    lever.setAttribute('height', '0.1');
    lever.setAttribute('depth', '0.04');
    lever.setAttribute('position', '0 0 0.02');
    this.el.appendChild(lever);
    this.lever = lever;

    this.el.addEventListener('click', () => {
      this.isActive = !this.isActive;
      this.updateState();
    });
  },
  updateState: function () {
    var rot = this.isActive ? -25 : 25;
    this.lever.setAttribute('rotation', `${rot} 0 0`);
    var color = this.isActive ? '#00FF00' : '#FF0000';
    this.lever.setAttribute('color', color);

    if (this.data.target) {
      if (this.data.type === 'fan') {
        this.data.target.setAttribute('fan-control', 'on', this.isActive);
      } else {
        this.data.target.setAttribute('light-control', 'on', this.isActive);
      }
    }
  }
});

AFRAME.registerComponent('fan-control', {
  schema: { on: { default: true } },
  update: function () {
    var speed = this.data.on ? 25 : 0;
    this.el.setAttribute('fan-spin', 'speed', speed);
  }
});

AFRAME.registerComponent('light-control', {
  schema: { on: { default: true } },
  update: function () {
    var intensity = this.data.on ? 0.6 : 0;
    this.el.setAttribute('light', 'intensity', intensity);
    var bulbs = this.el.querySelectorAll('a-sphere');
    bulbs.forEach(b => {
      b.setAttribute('material', 'emissiveIntensity', this.data.on ? 1 : 0.1);
    });
  }
});

/* ===== PLAYER MOVEMENT (WASD + Arrows + gravity + stairs) ===== */
AFRAME.registerComponent('player-move', {
  schema: { speed: { default: 5 }, jumpSpeed: { default: 5 } },
  init: function () {
    this.keys = {};
    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.playerHeight = 1.7;
    var self = this;
    document.addEventListener('keydown', function (e) { self.keys[e.code] = true; });
    document.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
  },
  tick: function (t, dt) {
    if (!dt || dt > 100) return;
    var s = this.data.speed * dt * 0.001;
    var cam = this.el.querySelector('[camera]') || this.el;
    var rot = cam.object3D.rotation;
    var dir = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dir.z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dir.z += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dir.x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dir.x += 1;
    if (dir.length() > 0) dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot.y);
    var pos = this.el.object3D.position;
    pos.x += dir.x * s;
    pos.z += dir.z * s;
    // Gravity + stair detection
    var targetY = this.getFloorHeight(pos.x, pos.z);
    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = this.data.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= 15 * dt * 0.001; // gravity
    pos.y += this.velocity.y * dt * 0.001;
    if (pos.y <= targetY + this.playerHeight) {
      pos.y = targetY + this.playerHeight;
      this.velocity.y = 0;
      this.onGround = true;
    }
  },
  getFloorHeight: function (x, z) {
    // Staircase zone: x between -2.5 and 0.5, z between -8 and 1.5 (Extended to -8)
    if (x >= -2.5 && x <= 0.5 && z >= -8.0 && z <= 1.5) {
      // Linear ramp from z=1.5 (h=0) to z=-8.0 (h=3.5)
      var progress = Math.max(0, Math.min(1, (1.5 - z) / 9.5));
      return progress * 3.5;
    }
    // Upper floor: inside villa footprint & y already high
    // Villa footprint roughly x: -12 to 12, z: -8 to 8
    if (x >= -12 && x <= 12 && z >= -8 && z <= 8) {
      // If we're above 2m, we're on upper floor
      var currentY = this.el.object3D.position.y - this.playerHeight;
      if (currentY > 2.0) return 3.5;
    }
    return 0;
  }
});

/* ===== AC UNIT VENT ANIMATION ===== */
AFRAME.registerComponent('ac-vent', {
  init: function () { this.time = 0; },
  tick: function (t, dt) {
    this.time += dt * 0.001;
    var vents = this.el.querySelectorAll('.ac-vent-line');
    for (var i = 0; i < vents.length; i++) {
      vents[i].object3D.rotation.x = Math.sin(this.time * 2 + i) * 0.15;
    }
  }
});

/* ===== CHANDELIER LIGHT FLICKER ===== */
AFRAME.registerComponent('chandelier-glow', {
  tick: function (t) {
    var lights = this.el.querySelectorAll('.chandelier-bulb');
    for (var i = 0; i < lights.length; i++) {
      var intensity = 0.8 + Math.sin(t * 0.003 + i * 1.5) * 0.15;
      var mesh = lights[i].getObject3D('mesh');
      if (mesh && mesh.material) {
        mesh.material.emissiveIntensity = intensity;
      }
    }
  }
});
