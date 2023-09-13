import XRmanager from "./XRmanager";
import TextMaker from "./TextMaker";
import { GPUComputationRenderer, Variable } from "./GPUComputationRenderer";
import computeVelocity from "./shaders/computeVelocity.glsl";
import computePosition from "./shaders/computePosition.glsl";
import computeAggregate from "./shaders/computeAggregate.glsl";
import knightVertex from "./shaders/knight.vertex.glsl";
import knightFragment from "./shaders/knight.fragment.glsl";
import { OrbitControls } from "./OrbitControls";
import { playRandomSoundAtPosition } from "./sounds";
import Music from "./music";

// P is player, E si enemy
// import Stats from "three/addons/libs/stats.module.js";
// let drawCallPanel: Stats.Panel;
const intersectedPlace: CustomGroup | null = null; // The sphere currently being pointed at
let startPlace: CustomGroup | null = null; // The first sphere selected when drawing a line
let endPlace: CustomGroup | null = null; // The second sphere selected when drawing a line
const controllers: THREE.Group[] = [];
let lastGenerationTime: number;
const WIDTH = 64;
const PARTICLES = WIDTH * WIDTH;
let knightUniforms: any;
const places: CustomGroup[] = [];
const placeSpheres: THREE.Object3D[] = []; // Spheres for easier raycasting
let renderer: THREE.WebGLRenderer;
let gpuCompute: GPUComputationRenderer;
let velocityVariable: Variable;
let positionVariable: any;
let aggregateVariable: any;
let textMaker: TextMaker;
let isDragging = false;
let gameStarted = false;
let currentTime = 0;
let rotator: THREE.Object3D;
const dtAggregateBuffer = new Float32Array(PARTICLES * 4);
const dtVelocityBuffer = new Float32Array(PARTICLES * 4);
const dtPositionBuffer = new Float32Array(PARTICLES * 4);
const computeCallbacks: { [key: string]: ((buffer: Float32Array) => void)[] } = {};
const toReset: number[] = [];
// This is a lock to prevent aggregation calculations while async unit launch is in progress
let unitLaunchInProgress = false;
const unitsFound = {
  p: 0,
  e: 0,
};
const trees: CustomGroup[] = [];
let difficulty = 0;
let controllerLock: null | number = null;
let lastRotationTime = 0;

class CustomGroup extends THREE.Group {
  u: any = {};
}

function fillTextures(tP: THREE.DataTexture, tV: THREE.DataTexture) {
  const posArray = tP.image.data;
  const velArray = tV.image.data;

  // velocityTexture.w is target castle

  for (let k = 0, kl = posArray.length; k < kl; k += 4) {
    // First row of the texture (WIDTH), is the castle locations
    if (k < 4 * WIDTH) {
      posArray[k + 0] = places[k / 4].position.x;
      posArray[k + 1] = places[k / 4].position.y;
      posArray[k + 2] = places[k / 4].position.z;
      posArray[k + 3] = 0.1; // fixed
      velArray[k + 3] = 1.0; // mass
    } else {
      // units/units
      posArray[k + 0] = -3.0;
      posArray[k + 1] = Math.random();
      posArray[k + 2] = 0;
      posArray[k + 3] = 99;

      velArray[k + 0] = 0; //1.0;
      velArray[k + 1] = 0; //0.5 - Math.random();
      velArray[k + 2] = 0; // 0.5 - Math.random();
      velArray[k + 3] = 0; // mass / 1000.0;
    }
  }
}

function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  const dtAggregate = gpuCompute.createTexture();
  fillTextures(dtPosition, dtVelocity);

  velocityVariable = gpuCompute.addVariable("tV", computeVelocity, dtVelocity, dtVelocityBuffer);
  (velocityVariable.material as any).uniforms.d = { value: 3 };

  positionVariable = gpuCompute.addVariable("tP", computePosition, dtPosition, dtPositionBuffer);
  aggregateVariable = gpuCompute.addVariable(
    "tA",
    computeAggregate,
    dtAggregate,
    dtAggregateBuffer,
  );

  gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);
  gpuCompute.setVariableDependencies(aggregateVariable, [positionVariable, velocityVariable]);

  const error = gpuCompute.init();

  if (error !== null) {
    console.error(error);
  }
}

function gradientTexture(color1: string, color2: string, color3: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error();
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);

  gradient.addColorStop(0.5, color1);
  gradient.addColorStop(0.51, color2);
  gradient.addColorStop(1.0, color3);

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const init = async () => {
  // Create a scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x505050);

  const pColor = new THREE.Color(0x00ff99);
  const eColor = new THREE.Color(0xc52f34);
  const selectedColor = new THREE.Color(0xffa500);
  // const selectedColor = pColor.clone().offsetHSL(0, 0.1, 0.5); //new THREE.Color(0xff0000);

  // Create a camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 6, -10);

  rotator = new THREE.Object3D();
  rotator.add(camera);
  scene.add(rotator);

  // const stats = new Stats();
  // drawCallPanel = stats.addPanel(new Stats.Panel("DRAWCALL", "#0ff", "#002"));
  // document.body.appendChild(stats.dom);

  // Gradient background for an icosahedron
  const gradTexture = gradientTexture("#000833", "#03123B", "#03123B");
  const gradMaterial = new THREE.MeshBasicMaterial({
    map: gradTexture,
    side: THREE.BackSide,
    "depthWrite": false,
    // wireframe: true,
  });
  const gradGeometry = new THREE.IcosahedronGeometry(100, 3);
  const gradMesh = new THREE.Mesh(gradGeometry, gradMaterial);
  scene.add(gradMesh);

  // const helper = new CameraHelper(camera);
  // scene.add(helper);

  // Create a light
  // const light = new PointLight(0xffffff, 10, 100);
  // light.position.set(0, 0, 0);
  // scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(0, 1, 1);
  // directionalLight.castShadow = true;
  scene.add(directionalLight);
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  // Create a renderer.
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  // renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  const xrManager = new XRmanager(renderer);
  renderer["setPixelRatio"](window.devicePixelRatio);
  renderer["setSize"](window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer["domElement"]);

  // Add orbit controller
  const controls = new OrbitControls(camera, renderer["domElement"]);
  controls["autoRotate"] = true;
  // Resize the canvas on window resize
  const adjustAspect = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera["aspect"] = width / height;
    camera["updateProjectionMatrix"]();
  };
  window.addEventListener("resize", function () {
    adjustAspect();
  });

  function stretchLineBetweenPoints(line: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // Reset the cube's state to the default
    // line.position.set(0, 0, 0);
    line.rotation.set(0, 0, 0);
    line.scale.set(1, 1, 1);
    // Use a matrix to define the orientation and apply it
    const orientation = new THREE.Matrix4();
    orientation.lookAt(start, end, new THREE.Vector3(0, 1, 0));
    // Rotate 90 degrees around X-axis to align the cube's top face with the forward direction
    const alignmentRotation = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    orientation.multiply(alignmentRotation);
    line["applyMatrix4"](orientation);

    // Apply the scaling to the Y dimension
    line.scale["setY"](length);

    // After scaling, we then set the position.
    // This order ensures the cube isn't prematurely moved before the scaling is done.
    line.position.copy(midpoint);
    line.visible = true;
  }

  // Create the indicator line
  // Use a cube for now
  const lineGeometry = new THREE.BoxGeometry(0.1, 1.0, 0.1);
  const lineMaterial = new THREE.MeshBasicMaterial({ "color": pColor });
  const line = new THREE.Mesh(lineGeometry, lineMaterial);
  line.visible = false;
  scene.add(line);

  // Create trees

  const canopyGeometry = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  canopyGeometry.translate(0, 0.5, 0);
  const trunkGeometry = new THREE.CylinderGeometry(0, 0.5, 1, 4, 1);
  trunkGeometry.translate(0, 0.5, 0);
  const vertexReplacement = `vec3 transformed = vec3(position);transformed.x += sin(position.y * 10.0 + time + float(gl_InstanceID)) * 0.1;transformed.z += cos(position.y * 10.0 + time + float(gl_InstanceID)) * 0.1;`;
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    "side": THREE.DoubleSide,
  });
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms["time"] = { value: 0 };
    shader["vertexShader"] = "uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexReplacement);
    canopyMaterial["userData"].shader = shader;
  };
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
  const rootGeometry = new THREE.BufferGeometry();

  const vertices = new Float32Array([
    -1.0,
    -1.0,
    0.0, // v0
    1.0,
    -1.0,
    0.0, // v1
    1.0,
    1.0,
    0.0, // v2
    -1.0,
    1.0,
    0.0, // v3
  ]);

  const indices = [0, 1, 2, 2, 3, 0];

  rootGeometry["setIndex"](indices);
  rootGeometry["setAttribute"]("position", new THREE.BufferAttribute(vertices, 3));
  rootGeometry["translate"](0, +1, 0);
  // rootGeometry.rotateY(-Math.PI / 2);
  rootGeometry["computeVertexNormals"]();
  rootGeometry["rotateY"](Math.PI);
  const rootMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
  rootMaterial["onBeforeCompile"] = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = "uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexReplacement);
    rootMaterial.userData.shader = shader;
  };

  // Create separate instanced meshes
  const canopyInstancedMesh = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, 64);
  const trunkInstancedMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 64);
  const rootsInstancedMesh = new THREE.InstancedMesh(rootGeometry, rootMaterial, 64 * 8);
  // To be re/used for scaling
  const treeDummy = new THREE.Group();
  const treeScale = 0.3;

  // Positional audio
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const createPositionalAudioPool = (listener: THREE.AudioListener) => {
    const audio = new THREE.PositionalAudio(listener);
    audio["setRefDistance"](20);
    audio["setVolume"](0.5);
    scene.add(audio);
    return audio;
  };
  // 8 positional audio sources, to be reused
  const positionalPool = {
    p: [1, 2, 3, 4].map(() => createPositionalAudioPool(listener)),
    e: [1, 2, 3, 4].map(() => createPositionalAudioPool(listener)),
  };

  // Logic to create random places
  const sphereCount = 64; // Number of places you want to create
  const radius = 5;

  function sphericalToCartesian(radius: number, polar: number, azimuthal: number) {
    const x = radius * Math.sin(polar) * Math.cos(azimuthal);
    const y = radius * Math.sin(polar) * Math.sin(azimuthal);
    const z = radius * Math.cos(polar);
    return new THREE.Vector3(x, y, z);
  }

  function scaleTreePart(
    type: "c" | "t" | "r",
    index: number,
    scale: number,
    mesh: THREE.InstancedMesh,
    sX: number,
    sY: number,
    sZ: number,
    rotation = 0,
    n = 1,
  ) {
    const part = treeDummy;
    const tree = trees[index];
    const baseOfTrunk = new THREE.Object3D();
    baseOfTrunk.position.set(0, 0.05, 0);

    part.parent = baseOfTrunk;
    baseOfTrunk.parent = tree;

    const t = treeScale;
    for (let i = 0; i < 8; i++) {
      const idx = n === 1 ? index : index * 8 + i;
      if (type === "r") {
        part.matrix.copy(tree.u.r[i]);
      } else {
        part.matrix.copy(tree.u[type]);
      }
      // mesh.getMatrixAt(idx, part.matrix);
      part.matrix.decompose(part.position, part.quaternion, part.scale);
      tree["setRotationFromAxisAngle"](new THREE.Vector3(1, 0, 0), rotation);
      baseOfTrunk.scale.set(scale * t * sX, scale * t * sY, scale * t * sZ);
      part["updateWorldMatrix"](true, true);
      mesh.setMatrixAt(idx, part["matrixWorld"]);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function setTreeScaleAndRotation(index: number, scale: number, rotation?: number) {
    scaleTreePart("c", index, scale, canopyInstancedMesh, 1, 1, 1, rotation);
    scaleTreePart("t", index, scale, trunkInstancedMesh, 1, 1, 1, rotation);
    scaleTreePart("r", index, scale, rootsInstancedMesh, 0.03, 0.3, 1.0, rotation, 8);
  }

  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < sphereCount; i++) {
    // Distribute polar angles relatively evenly by splitting max angle into even segments
    const polar = Math.acos(1 - (2 * (i + 0.5)) / sphereCount);
    // if (polar > maxPolarAngle) continue; // Skip anything beyond half-circle

    // Distribute azimuthal angles based on golden ratio
    const azimuthal = (2 * Math.PI * (i % goldenRatio)) / goldenRatio;

    const position = sphericalToCartesian(radius, polar, azimuthal);

    const place = createPlace(i === 0 ? 0 : i === sphereCount - 1 ? 1 : undefined) as CustomGroup;

    scene.add(place);
    const material = new THREE.MeshBasicMaterial();

    places.push(place);
    // Random position in the scene
    place.position.copy(position);
    const placeSphere = new THREE.Mesh(new THREE.SphereGeometry(place.u["size"] / 10.0), material);
    placeSphere.position.copy(place.position.clone());
    placeSpheres.push(placeSphere);
    place.u.sphere = placeSphere;
    placeSphere.visible = false;
    scene.add(placeSphere);

    // Add the trees
    const tree = new CustomGroup();
    tree.position.copy(place.position);
    trees.push(tree);
    const dummy = new THREE.Object3D();
    canopyInstancedMesh["setMatrixAt"](i, dummy.matrix);
    tree["u"]["c"] = dummy.matrix.clone();
    trunkInstancedMesh.setMatrixAt(i, dummy.matrix);
    tree.u["t"] = dummy.matrix.clone();

    // Air roots
    const rndScale = 1.5;
    tree.u["r"] = [];
    for (let j = 0; j < 8; j++) {
      dummy["matrix"]["identity"]()["decompose"](dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.x += Math.random() * rndScale * 30 - 0.5 * rndScale * 30;
      dummy.position.z += Math.random() * rndScale - 0.5 * rndScale;
      dummy["updateMatrix"]();
      tree.u.r.push(dummy.matrix.clone());
      rootsInstancedMesh["setMatrixAt"](i * 8 + j, dummy.matrix);
    }
    place.u.i = i;

    if (i === 0) {
      place.u.owner = "p";
      place.u.color = pColor;
      place.u.troops = 100;
      setTreeScaleAndRotation(i, 1);
      place.u.scale = 1;
    } else if (i === sphereCount - 1) {
      place.u.owner = "e";
      place.u.troops = 100;
      place.u.color = eColor;
      setTreeScaleAndRotation(i, 0);
    } else {
      place.u.color = new THREE.Color(0xffffff); // White
      setTreeScaleAndRotation(i, 0);
    }

    setColorForAllChildren(place, place.u.color); // Set the color for all children (towers and main building
  }
  // canopyInstancedMesh.castShadow = true;
  scene.add(canopyInstancedMesh);
  scene.add(trunkInstancedMesh);
  scene.add(rootsInstancedMesh);

  initComputeRenderer();
  initKnights();

  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);

  function createTextSprite(message: string, followCameraRotation = false, followCamera = false) {
    const text = textMaker.addText(
      message,
      new THREE.Color(0xfff),
      followCameraRotation,
      followCamera,
    );
    return text;
  }
  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Play in VR" : `Play`;

  // Update the pointing ray
  // Update function to detect sphere pointing
  function updatePointing() {
    if (!controllers[0]) return [];
    let intersects = [];
    if (controllerLock === null) {
      intersects = [...intersectsFromController(0), ...intersectsFromController(1)];
    } else {
      intersects = intersectsFromController(controllerLock);
    }
    handlePointingMoving(intersects);
  }

  function intersectsFromController(i: number): THREE.Intersection[] {
    const controller = controllers[i];
    const tempMatrix = new THREE.Matrix4();
    controller["updateMatrixWorld"]();
    tempMatrix.identity()["extractRotation"](controller.matrixWorld);

    const ray = new THREE.Raycaster();
    ray["camera"] = camera;
    ray["ray"].origin["setFromMatrixPosition"](controller.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    return ray.intersectObjects(placeSpheres);
  }

  function handlePointingMoving(intersects: THREE.Intersection[], event?: MouseEvent) {
    if (intersects.length > 0) {
      event?.preventDefault();
      const index = placeSpheres.indexOf(intersects[0].object);
      console.log("index", index);
      const place = places[index] as CustomGroup;
      if (place) {
        setColorForAllChildren(place, selectedColor);
      }
      if (startPlace && place !== startPlace) {
        setColorForAllChildren(place, startPlace.u.color);
        stretchLineBetweenPoints(line, startPlace.position, place.position);
      }
      if (endPlace !== place) {
        if (endPlace) {
          setColorForAllChildren(endPlace, endPlace.u.color);
        }
        endPlace = place;
      }
    } else {
      // hide the line
      line.visible = false;
      if (endPlace) {
        setColorForAllChildren(endPlace, endPlace.u.color);
      }
      // console.log("no start intersect");
    }
  }

  function handleClickOrTriggerStart(
    intersects: THREE.Intersection[],
    event?: MouseEvent | TouchEvent,
  ) {
    console.log(event, intersects);
    if (intersects.length > 0) {
      event?.preventDefault();
      const place = places[placeSpheres.indexOf(intersects[0].object)];
      if (place.u.owner === "p") {
        controls.enabled = false;
        startPlace = place as CustomGroup;
        isDragging = true;
      }
    }
    // else {
    //   // console.log("no start intersect");
    // }
  }

  function handleClickOrTriggerEnd(
    intersects: THREE.Intersection[],
    event?: MouseEvent | TouchEvent,
  ) {
    if (intersects.length > 0) {
      endPlace = places[placeSpheres.indexOf(intersects[0].object)] as CustomGroup;
      if (startPlace && endPlace !== startPlace) {
        console.log("startPlace attacks:", startPlace, "endPlace", endPlace);
        sendFleetFromPlaceToPlace(startPlace, endPlace);
      }
    }
    controls.enabled = true;
    // Reset
    if (startPlace) {
      setColorForAllChildren(startPlace, startPlace.u.color);
    }
    if (endPlace) {
      setColorForAllChildren(endPlace, endPlace.u.color);
    }
    startPlace = null;
    endPlace = null;
    isDragging = false;
    line.visible = false;
  }

  function setColorForAllChildren(object: THREE.Group, color: THREE.Color) {
    object["traverse"]((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.emissive.copy(color);
        material.color.copy(color);
        material["emissiveIntensity"] = 0.1;
      }
    });
  }
  function updateTroopsDisplay(place: CustomGroup, troopsCount: number) {
    const intensity = Math.min(1, troopsCount / 100);
    if (place.u.troopsDisplay) {
      // The higher the number of troops, the closer the color should be
      // to the owner's color
      // place.u.shield.morphTargetInfluences[0] = 0.5 + 0.4 * Math.sin(troopsCount / 10);
      place.u.troopsDisplay["updateText"](
        troopsCount.toString(),
        new THREE.Color(
          place.u.color["r"] * intensity,
          place.u.color["g"] * intensity,
          place.u.color["b"] * intensity,
        ),
      );
      place.u.troopsDisplay.setScale(Math.min(1 + troopsCount / 100, 2));
    } else {
      place.u.troopsDisplay = createTextSprite(troopsCount.toString(), true);
      place.u.troopsDisplay.setPosition(place.position.x, place.position.y + 0.2, place.position.z);
    }
    // Also reflect troop numbers in tree size
    if (place.u.owner === "p") {
      setTreeScaleAndRotation(
        place.u.i,
        Math.min(1, troopsCount / 100),
        // Math.sin(new Date().getTime() / 1000) * 0.5 + 0.5,
      );
    }
  }

  function generateTroops(castle: CustomGroup, timeDelta: number) {
    const sizeFactor = castle.u.size; // Simple size measure
    // TODO temp p adv
    if (castle.u.owner === "p") {
      castle.u.troops += sizeFactor * timeDelta * 0.001;
    } else if (castle.u.owner === "e") {
      castle.u.troops += sizeFactor * timeDelta * 0.001;
    }
    updateTroopsDisplay(castle, Math.floor(castle.u.troops));
  }

  function updateTroops() {
    const now = Date.now();

    for (const castle of places) {
      generateTroops(
        castle as CustomGroup,
        (castle as CustomGroup).u.owner ? now - lastGenerationTime : 0,
      );
    }
    lastGenerationTime = now;
  }

  function addComputeCallback(name: string, callback: (buffer: Float32Array) => void) {
    if (!computeCallbacks[name]) {
      computeCallbacks[name] = [];
    }
    computeCallbacks[name].push(callback);
  }

  function removeComputeCallback(name: string, callback: (buffer: Float32Array) => void) {
    if (!computeCallbacks[name]) {
      return;
    }
    const index = computeCallbacks[name].indexOf(callback);
    if (index > -1) {
      computeCallbacks[name].splice(index, 1);
    }
  }

  function checkForParticleArrivals(dataAgg: Float32Array) {
    if (unitLaunchInProgress) {
      console.log("unitLaunchInProgress");
      return;
    }
    unitsFound["e"] = 0;
    unitsFound["p"] = 0;

    for (let i = 0; i < dataAgg.length; i += 4) {
      // Check if the ship has collided
      if (dataAgg[i + 3] < 0) {
        // The ship has collided
        const place = places[Math.floor((-dataAgg[i + 3] - 0.5) * WIDTH)] as CustomGroup;
        // Deduct points from the castle or perform other actions
        const shipOwner = dataAgg[i + 1] < 0.6005 ? "p" : "e"; // 0.6 is p, 0.601 is e
        if (place) {
          playRandomSoundAtPosition(shipOwner, place.position, positionalPool);
          if (!place.u.owner || place.u.owner !== shipOwner) {
            place.u.troops -= 1;

            if (place.u.troops <= 0) {
              // The castle has been conquered
              place.u.troops = 1;
              place.u.owner = shipOwner;
              place.u.color = shipOwner === "p" ? pColor : eColor;
              setColorForAllChildren(place as THREE.Group, place.u.color);

              // Set target rotation
              // We will lerp towards this each frame, orientation is used for ownership graphics

              // Target rotation is PI left or PI right, depending on who the new owner is
              place.u.targetRotation += shipOwner === "p" ? Math.PI : -Math.PI;
              place.u.targetRotation = place.u.targetRotation % (Math.PI * 2);
            }
          } else {
            // If the end place is owned by the same p, add troops
            place.u.troops += 1;
          }
        }

        toReset.push(i);
      } else if (dataAgg[i + 3] > 0) {
        if (dataAgg[i + 1] < 0.6005 && dataAgg[i + 1] > 0.5995) {
          unitsFound.p++;
        } else if (dataAgg[i + 1] > 0.6005 && dataAgg[i + 1] < 0.6015) {
          unitsFound.e++;
        }
      }
    }

    // Check if the game is over
    const planetOwners = places.map((place) => place.u.owner);
    const pWon = planetOwners.every((owner) => [null, "p"].includes(owner)) && unitsFound.e === 0;
    const eWon = planetOwners.every((owner) => [null, "e"].includes(owner)) && unitsFound.p === 0;
    let gameOverText;
    if (pWon) {
      gameOverText = "Victory!";
    } else if (eWon) {
      gameOverText = "You lose. Darkness has fallen.";
    }
    if (gameOverText) {
      gameStarted = false;
      if (renderer.xr["isPresenting"]) {
        xrManager.endSession();
        adjustAspect();
      }
      document.getElementById("p")!.innerHTML = gameOverText;
      togglePauseScreen();
    }
  }

  // This we need to do every frame
  addComputeCallback("tA", (buffer) => {
    checkForParticleArrivals(buffer);
    updateTroops();
  });

  function handleControllers() {
    const session = renderer.xr["getSession"]();
    const currentTime = Date.now();
    // If gamepad horizontal is pressed, rotate camera
    if (session) {
      const inputSources = session.inputSources;
      for (let i = 0; i < inputSources.length; i++) {
        const inputSource = inputSources[i];
        const gamepad = inputSource.gamepad;
        if (gamepad) {
          const axes = gamepad.axes;
          if (axes[2] > 0.5 && currentTime - lastRotationTime > 250) {
            rotator.rotateY(-Math.PI / 4);
            lastRotationTime = currentTime;
          } else if (axes[2] < -0.5 && currentTime - lastRotationTime > 250) {
            lastRotationTime = currentTime;
            rotator.rotateY(Math.PI / 4);
          }
          textMaker.cameraRotation = rotator.rotation.y;
        }
      }
    }
  }

  // Animation loop
  function render(time: number) {
    controls["update"]();
    const delta = time - currentTime;
    currentTime = time;

    handleControllers();
    if (gameStarted) {
      lastGenerationTime = lastGenerationTime || Date.now();
      gpuCompute.compute(computeCallbacks);

      const tP = gpuCompute.getCurrentRenderTarget(positionVariable)["texture"];
      const tV = gpuCompute.getCurrentRenderTarget(velocityVariable)["texture"];

      knightUniforms["tP"].value = tP;
      knightUniforms["tV"].value = tV;

      updatePointing();

      for (const place of places) {
        const lerpSpeed = delta / 1200;
        const distance = place.u.targetRotation - place.rotation.x;
        if (Math.abs(distance) > 0.01) {
          // When rotation is 0, e.g. p takes place then AI takes it back
          // we need to invert the morph target.
          const invert = place.u.targetRotation === 0;
          place.rotation.x += distance * lerpSpeed;

          const desiredMorphState = (place.u.owner === "p" ? 1 : 0) ^ +invert;
          const morphSpeed =
            (desiredMorphState - place.u.shield.morphTargetInfluences[0]) * lerpSpeed;
          place.u.shield.morphTargetInfluences[0] += morphSpeed;
          place.u.shield.morphTargetInfluences[0] = Math.min(
            Math.max(place.u.shield.morphTargetInfluences[0], 0),
            1,
          );

          if (place.u.owner === "p") {
            place.u.scale = ((1 - Math.abs(distance / Math.PI)) * place.u.troops) / 100;
          } else if (place.u.owner === "e") {
            place.u.scale = 0; // place.u.scale - lerpSpeed;
          }
          place.u.scale = Math.min(Math.max(place.u.scale, 0), 1);
          setTreeScaleAndRotation(
            place.u.i,
            place.u.scale,
            place.rotation.x + place.u.targetRotation,
          );
        }
      }
    }
    if (canopyMaterial.userData.shader) {
      canopyMaterial.userData.shader.uniforms.time.value += 0.03;
    }
    if (rootMaterial.userData.shader) {
      rootMaterial.userData.shader.uniforms.time.value += 0.03;
    }
    renderer.render(scene, camera);
    // drawCallPanel.update(renderer.info.render.calls, 200);
    // stats.update();
  }
  renderer["setAnimationLoop"](render);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener("mousedown", onPointerDown, false);
  window.addEventListener("mousemove", onPointerMove, false);
  window.addEventListener("mouseup", onPointerUp, false);
  window.addEventListener("touchstart", onPointerDown, false);
  window.addEventListener("touchmove", onPointerMove, false);
  window.addEventListener("touchend", onPointerUp, false);

  function getPointerPosition(event: MouseEvent | Touch) {
    return { x: event.clientX, y: event.clientY };
  }

  function onPointerDown(event: MouseEvent | TouchEvent) {
    const position =
      event instanceof TouchEvent
        ? getPointerPosition(event.touches[0])
        : getPointerPosition(event);
    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster["setFromCamera"](mouse, camera);
    const intersects = raycaster["intersectObjects"](placeSpheres);

    handleClickOrTriggerStart(intersects, event);
  }

  function onPointerMove(event: MouseEvent | TouchEvent) {
    if (!isDragging) return;

    const position =
      event instanceof TouchEvent
        ? getPointerPosition(event.touches[0])
        : getPointerPosition(event);
    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);
    handlePointingMoving(intersects);
  }

  function onPointerUp(event: MouseEvent | TouchEvent) {
    if (!isDragging) return;

    const position =
      event instanceof TouchEvent
        ? getPointerPosition(event.changedTouches[0])
        : getPointerPosition(event);

    mouse.x = (position.x / window.innerWidth) * 2 - 1;
    mouse.y = -(position.y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    handleClickOrTriggerEnd(intersects, event);
  }

  function initControllers() {
    // Handle controllers for WebXR
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr["getController"](i);
      rotator.add(controller);

      // Create a visual representation for the controller: a cube
      const geometry = new THREE.BoxGeometry(0.025, 0.025, 0.2);
      const material = new THREE.MeshStandardMaterial({ color: pColor });
      const cube = new THREE.Mesh(geometry, material);
      controller.add(cube); // Attach the cube to the controller

      controllers.push(controller);
      controller.addEventListener("selectstart", () => onSelectStart(i));
      controller.addEventListener("selectend", () => onSelectEnd(i));
    }
  }

  function onSelectStart(i: number) {
    console.log("select start");
    const intersects = intersectsFromController(i);
    handleClickOrTriggerStart(intersects);
    controllerLock = i;
  }

  function onSelectEnd(i: number) {
    console.log("select end", startPlace, intersectedPlace);
    endPlace = intersectedPlace;
    const intersects = intersectsFromController(i);
    handleClickOrTriggerEnd(intersects);
    controllerLock = null;
  }

  function createPlace(morphTargetInfluence = 0.5) {
    const place = new CustomGroup();
    // Create shield with random sizes
    // Top width should always be smaller than bottom width
    const topWidth = 1 + Math.random() * 2.0;
    const bottomWidth = 3 + Math.random() * 4.0;
    const shieldGeometry = new THREE.CylinderGeometry(bottomWidth, topWidth, 1.0, 24);
    const shieldGeometry2 = new THREE.CylinderGeometry(topWidth, bottomWidth, 1.0, 24);

    // Add a morph target
    shieldGeometry["morphAttributes"].position = [];
    shieldGeometry["morphAttributes"].normal = [];
    shieldGeometry["morphAttributes"].position[0] = shieldGeometry2.attributes.position;
    shieldGeometry["morphAttributes"].normal[0] = shieldGeometry2.attributes.normal;

    const shieldMaterial = new THREE.MeshStandardMaterial({ color: pColor });

    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    // shield.receiveShadow = true;
    shield["morphTargetInfluences"]![0] = morphTargetInfluence;

    shield.position.set(0, 0.0, 0);
    // shield.rotation.set(Math.PI / 2, 0, 0);
    place.add(shield);
    shieldGeometry["computeBoundingSphere"]();
    place.u = place["userData"];
    place.u.size = shieldGeometry["boundingSphere"]
      ? shieldGeometry["boundingSphere"]["radius"]
      : 0;
    // Initial troops
    place.u.troops = Math.floor(Math.random() * place.u.size * 10);
    // Initial owner
    place.u.owner = null;
    place.u.scale = 0.0;
    place.u.targetRotation = 0.0;
    place.u.shield = shield;
    place.scale.set(0.1, 0.1, 0.1);
    return place;
  }

  async function startGame() {
    difficulty = parseInt((document.getElementById("d")! as HTMLInputElement).value);
    (velocityVariable.material as any).uniforms.d.value = difficulty;
    // createTextSprite("Game started!", false, true);
    if (xrSupport) {
      await xrManager.startSession();
      // const ref = renderer.xr.getReferenceSpace();

      initControllers();
    }
    const music = new Music();
    music.start();

    // document.getElementById("s")?.remove();
    document.getElementById("i")?.remove();
    controls.autoRotate = false;
    gameStarted = true;
    window.onblur = () => {
      gameStarted = false;
      togglePauseScreen();
    };
    window.onfocus = () => {
      gameStarted = true;
      togglePauseScreen();
    };
    // TODO!! window.onbeforeunload = (e) => (e.returnValue = "Game in progress");
    // P pauses the game
    document.addEventListener("keydown", (e) => {
      if (e.key === "p") {
        gameStarted = !gameStarted;
      }
      togglePauseScreen();
    });
    (window as any).scene = scene;

    // Simple AI sends attacks high priority targets and low resistance targets
    setInterval(
      () => {
        // Random e owned castle
        const eCastles = places.filter((p) => p.u.owner === "e");
        const otherCastles = places.filter((p) => !eCastles.includes(p));
        // const pCastles = places.filter((p) => p.u.owner === "p");

        // Sort by a combination of size and troops, giving priority to larger places with fewer troops.
        const highValueTargets = otherCastles.sort(
          (a, b) => b.u.size / (b.u.troops + 1) - a.u.size / (a.u.troops + 1),
        );
        const startPlace = eCastles[Math.floor(Math.random() * eCastles.length)];
        // Prioritize attacking places based priority, but attack random ones based on level
        const randomness = Math.random() < difficulty / 3;
        const endPlace = randomness
          ? highValueTargets[0]
          : otherCastles[Math.floor(Math.random() * otherCastles.length)];

        if (startPlace && endPlace && startPlace !== endPlace) {
          sendFleetFromPlaceToPlace(startPlace, endPlace);
        }
      },
      5000 - difficulty * 1000,
    );
  }
  function togglePauseScreen() {
    lastGenerationTime = Date.now();
    const style = gameStarted ? "none" : "block";
    document.getElementById("p")!.style.display = style;
  }

  const cont = document.getElementById("x");
  cont?.addEventListener("click", () => {
    document.getElementById("s")!.style.display = "none";
    document.getElementById("i")!.style.display = "block";
  });

  const button = document.getElementById("b");
  if (button) {
    button.innerHTML = text;
    button.addEventListener("click", startGame);
  }

  function initKnights() {
    const baseGeometry = new THREE.CylinderGeometry(0.2, 0, 0.9, 4, 1);
    baseGeometry.scale(0.3, 0.3, 0.3);
    baseGeometry["rotateX"](-Math.PI / 2);
    const instancedGeometry = new THREE.InstancedBufferGeometry();
    instancedGeometry["index"] = baseGeometry["index"];
    instancedGeometry.attributes.position = baseGeometry.attributes.position;
    instancedGeometry.attributes.uv = baseGeometry.attributes.uv;

    instancedGeometry["instanceCount"] = PARTICLES;
    const uvs = new Float32Array(PARTICLES * 2);
    let p = 0;

    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        uvs[p++] = i / (WIDTH - 1);
        uvs[p++] = j / (WIDTH - 1);
      }
    }

    instancedGeometry.setAttribute("dtUv", new THREE.InstancedBufferAttribute(uvs, 2));
    knightUniforms = {
      "tP": { value: null },
      "tV": { value: null },
      "eC": { value: eColor },
      "pC": { value: pColor },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: knightUniforms,
      vertexShader: knightVertex,
      fragmentShader: knightFragment,
      // transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(instancedGeometry, material, PARTICLES);
    mesh["frustumCulled"] = false;
    scene.add(mesh);
  }

  function sendFleetFromPlaceToPlace(startPlace: CustomGroup, endPlace: CustomGroup) {
    addUnitsToTexture(startPlace.u.troops / 2, startPlace, endPlace, startPlace.u.owner);
  }

  function addUnitsToTexture(
    numberOfShips: number,
    startPlace: CustomGroup,
    endPlace: CustomGroup,
    owner: "p" | "e",
  ) {
    const targetId = places.indexOf(endPlace);
    const dtTarget = (targetId + 0.5) / WIDTH + 0.5;

    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();
    const source = startPlace.position;
    let slotsFound = 0;
    const slots: number[] = [];
    const positionCallback = (buffer: Float32Array) => {
      // console.log("Position callback");
      dtPosition.image.data.set(buffer);
      const posArray = dtPosition.image.data;

      for (let i = 0; i < slots.length; i++) {
        // Ships should be spread out in the direction of the target
        // const direction = new THREE.Vector3().subVectors(endPlace.position, source);
        const index = slots[i];
        if (owner === "p") {
          posArray[index] = source.x + (Math.random() - 0.5) * 0.1;
          posArray[index + 1] = source.y - (Math.random() - 0.5) * 0.1;
          posArray[index + 2] = source.z + (Math.random() - 0.5) * 0.1;
          posArray[index + 3] = 0.6; // ship type
        } else {
          posArray[index] = source.x + (Math.random() - 0.5) * 0.1;
          posArray[index + 1] = source.y + Math.random() * 0.5;
          posArray[index + 2] = source.z + (Math.random() - 0.5) * 0.1;
          posArray[index + 3] = 0.601; // ship type
        }
        // direction.normalize();
      }
      removeComputeCallback("tP", positionCallback);
      dtPosition.needsUpdate = true;

      const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
      // gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
      gpuCompute.renderTexture(dtPosition, rt);
      dtVelocity.needsUpdate = true;
      const rtv = gpuCompute.getCurrentRenderTarget(velocityVariable);
      gpuCompute.renderTexture(dtVelocity, rtv);

      console.log("Added units", slots.length, "to", endPlace.id, "from", source, "for", owner);
      startPlace.u.troops -= startPlace.u.troops / 2;
      slots.length = 0;
      unitLaunchInProgress = false;
    };

    const velocityCallback = (buffer: Float32Array) => {
      unitLaunchInProgress = true;
      // console.log("Velocity callback");
      dtVelocity.image.data.set(buffer);
      const velArray = dtVelocity.image.data;
      for (let i = 0; i < velArray.length; i += 4) {
        // Only allow 1/2 of total units per p
        if (unitsFound[owner] + slotsFound >= PARTICLES / 2 - 64) {
          break;
        }
        // Check if the slot is empty
        if (velArray[i + 3] === 0) {
          // Update the slot
          velArray[i] = 0.0;
          velArray[i + 1] = 0.0;
          velArray[i + 2] = 0.0;
          velArray[i + 3] = dtTarget; // target castle id
          slotsFound++;
          slots.push(i);
        }
        if (slotsFound > numberOfShips - 1) {
          break;
        }
      }
      if (slotsFound < Math.floor(numberOfShips)) {
        console.warn(
          `Only ${slotsFound} slots were found and updated. Requested ${numberOfShips}.`,
        );
      }
      removeComputeCallback("tV", velocityCallback);
      addComputeCallback("tP", positionCallback);
    };

    addComputeCallback("tV", velocityCallback);
  }
};

init();
