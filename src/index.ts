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
// import { LineMaterial, LineGeometry } from "./line";
import Stats from "three/addons/libs/stats.module.js";
let drawCallPanel: Stats.Panel;
const intersectedPlace: CustomGroup | null = null; // The sphere currently being pointed at
let startPlace: CustomGroup | null = null; // The first sphere selected when drawing a line
let endPlace: CustomGroup | null = null; // The second sphere selected when drawing a line
const controllers: THREE.Group[] = [];
let lastGenerationTime = Date.now();
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
const dtAggregateBuffer = new Float32Array(PARTICLES * 4);
const dtVelocityBuffer = new Float32Array(PARTICLES * 4);
const dtPositionBuffer = new Float32Array(PARTICLES * 4);
const computeCallbacks: { [key: string]: ((buffer: Float32Array) => void)[] } = {};
const toReset: number[] = [];
// This is a lock to prevent aggregation calculations while async unit launch is in progress
let unitLaunchInProgress = false;
const unitsFound = {
  player: 0,
  enemy: 0,
};
const trees: CustomGroup[] = [];

const {
  Texture,
  Scene,
  Color,
  PerspectiveCamera,
  IcosahedronGeometry,
  MeshBasicMaterial,
  Mesh,
  WebGLRenderer,
  // PointLight,
  DirectionalLight,
  // Vector3,
  Vector2,
  Raycaster,
  BoxGeometry,
  ShaderMaterial,
  MeshStandardMaterial,
  AudioListener,
  PositionalAudio,
  SphereGeometry,
  Matrix4,
  CylinderGeometry,
  Group,
} = THREE;

class CustomGroup extends Group {
  ud: any = {};
}

function fillTextures(texturePosition: THREE.DataTexture, textureVelocity: THREE.DataTexture) {
  const posArray = texturePosition.image.data;
  const velArray = textureVelocity.image.data;

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

  velocityVariable = gpuCompute.addVariable(
    "textureVelocity",
    computeVelocity,
    dtVelocity,
    dtVelocityBuffer,
  );
  positionVariable = gpuCompute.addVariable(
    "texturePosition",
    computePosition,
    dtPosition,
    dtPositionBuffer,
  );
  aggregateVariable = gpuCompute.addVariable(
    "textureAggregate",
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

function gradientTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error();
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);

  gradient.addColorStop(0.1, "#000833");
  gradient.addColorStop(0.6, "#01235E");
  gradient.addColorStop(0.7, "#01418F");
  gradient.addColorStop(0.9, "#005AB4");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const init = async () => {
  // Create a scene
  const scene = new Scene();
  scene.background = new Color(0x505050);

  const playerColor = new Color(0x266f56);
  const enemyColor = new Color(0xc52f34);
  const selectedColor = new Color(0xff0000);

  // Create a camera
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 6, -10);

  const stats = new Stats();
  drawCallPanel = stats.addPanel(new Stats.Panel("DRAWCALL", "#0ff", "#002"));
  document.body.appendChild(stats.dom);

  // Gradient background for an icosahedron
  const gradTexture = gradientTexture();
  const gradMaterial = new MeshBasicMaterial({
    map: gradTexture,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const gradGeometry = new IcosahedronGeometry(100, 2);
  const gradMesh = new Mesh(gradGeometry, gradMaterial);
  scene.add(gradMesh);

  // const helper = new CameraHelper(camera);
  // scene.add(helper);

  // Create a light
  // const light = new PointLight(0xffffff, 10, 100);
  // light.position.set(0, 0, 0);
  // scene.add(light);
  const directionalLight = new DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(0, 1, 1);
  // directionalLight.castShadow = true;
  scene.add(directionalLight);
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  // Create a renderer.
  // TODO Opportunity to gain some bytes by using the default canvas
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Could not find canvas element");
  }
  renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    canvas,
  });
  // renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  const xrManager = new XRmanager(renderer);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Add orbit controller
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = true;
  // Resize the canvas on window resize
  window.addEventListener("resize", function () {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
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
    line.applyMatrix4(orientation);

    // Apply the scaling to the Y dimension
    line.scale.setY(length);

    // After scaling, we then set the position.
    // This order ensures the cube isn't prematurely moved before the scaling is done.
    line.position.copy(midpoint);
    line.visible = true;
  }

  // Create the indicator line
  // Use a cube for now
  const lineGeometry = new BoxGeometry(0.1, 1.0, 0.1);
  const lineMaterial = new MeshBasicMaterial({ color: playerColor });
  const line = new Mesh(lineGeometry, lineMaterial);
  line.visible = false;
  scene.add(line);

  // Create trees

  const canopyGeometry = new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  canopyGeometry.translate(0, 0.5, 0);
  const trunkGeometry = new THREE.CylinderGeometry(0, 0.5, 1, 4, 1);
  trunkGeometry.translate(0, 0.5, 0);
  const vertexReplacement = `
        vec3 transformed = vec3(position);
        transformed.x += sin(position.y * 10.0 + time + float(gl_InstanceID)) * 0.1;
        transformed.z += cos(position.y * 10.0 + time + float(gl_InstanceID)) * 0.1;
      `;
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    side: THREE.DoubleSide,
  });
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = "uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexReplacement);
    canopyMaterial.userData.shader = shader;
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

  rootGeometry.setIndex(indices);
  rootGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  rootGeometry.translate(0, +1, 0);
  // rootGeometry.rotateY(-Math.PI / 2);
  rootGeometry.computeVertexNormals();
  rootGeometry.rotateY(Math.PI);
  const rootMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
  rootMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = "uniform float time;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", vertexReplacement);
    rootMaterial.userData.shader = shader;
  };

  // Create separate instanced meshes
  const canopyInstancedMesh = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, 64);
  const trunkInstancedMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 64);
  const rootsInstancedMesh = new THREE.InstancedMesh(rootGeometry, rootMaterial, 64 * 8);
  // canopyInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // trunkInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // rootsInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // To be re/used for scaling
  const treeDummy = new THREE.Group();
  const treeScale = 0.3;

  // Positional audio
  const listener = new AudioListener();
  camera.add(listener);

  const createPositionalAudioPool = (listener: THREE.AudioListener) => {
    const audio = new PositionalAudio(listener);
    audio.setRefDistance(20);
    audio.setVolume(0.5);
    scene.add(audio);
    return audio;
  };
  // 8 positional audio sources, to be reused
  const positionalPool = {
    player: [1, 2, 3, 4].map(() => createPositionalAudioPool(listener)),
    enemy: [1, 2, 3, 4].map(() => createPositionalAudioPool(listener)),
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
        part.matrix.copy(tree.ud.r[i]);
      } else {
        part.matrix.copy(tree.ud[type]);
      }
      // mesh.getMatrixAt(idx, part.matrix);
      part.matrix.decompose(part.position, part.quaternion, part.scale);
      tree.setRotationFromAxisAngle(new THREE.Vector3(1, 0, 0), rotation);
      baseOfTrunk.scale.set(scale * t * sX, scale * t * sY, scale * t * sZ);
      part.updateWorldMatrix(true, true);
      mesh.setMatrixAt(idx, part.matrixWorld);
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

    const place = createPlace() as CustomGroup;

    scene.add(place);
    const material = new MeshStandardMaterial({
      opacity: 0.5,
      transparent: false,
      //side: THREE.DoubleSide,
    });

    places.push(place);
    // Random position in the scene
    place.position.copy(position);
    const placeSphere = new Mesh(new SphereGeometry(place.ud.size / 10.0), material);
    placeSphere.position.copy(place.position.clone());
    placeSpheres.push(placeSphere);
    placeSphere.visible = false;
    scene.add(placeSphere);

    // Add the trees
    const tree = new CustomGroup();
    tree.position.copy(place.position);
    trees.push(tree);
    const dummy = new THREE.Object3D();
    canopyInstancedMesh.setMatrixAt(i, dummy.matrix);
    tree.ud.c = dummy.matrix.clone();
    trunkInstancedMesh.setMatrixAt(i, dummy.matrix);
    tree.ud.t = dummy.matrix.clone();
    // const yOffset = 0.2;
    // dummy.position.y += yOffset;
    // dummy.scale.set(treeScale, treeScale, treeScale);
    // dummy.updateMatrix();

    // Air roots
    const rndScale = 1.5;
    tree.ud.r = [];
    for (let j = 0; j < 8; j++) {
      dummy.matrix.identity().decompose(dummy.position, dummy.quaternion, dummy.scale);
      // dummy.position.copy(place.position);
      dummy.position.x += Math.random() * rndScale * 30 - 0.5 * rndScale * 30;
      dummy.position.z += Math.random() * rndScale - 0.5 * rndScale;
      // dummy.position.y += yOffset;
      // dummy.scale.set(0.03 * treeScale, 0.5 * treeScale, 1 * treeScale);
      // dummy.rotateY((Math.PI / 4) * j);
      dummy.updateMatrix();
      tree.ud.r.push(dummy.matrix.clone());
      rootsInstancedMesh.setMatrixAt(i * 8 + j, dummy.matrix);
    }
    place.ud.i = i;

    if (i === 0) {
      place.ud.owner = "player";
      place.ud.color = playerColor;
      setTreeScaleAndRotation(i, 1);
      place.ud.scale = 1;
    } else if (i === sphereCount - 1) {
      place.ud.owner = "enemy";
      place.ud.color = enemyColor;
      setTreeScaleAndRotation(i, 0);
    } else {
      place.ud.color = new Color(0xffffff); // White
      setTreeScaleAndRotation(i, 0);
    }

    setColorForAllChildren(place, place.ud.color); // Set the color for all children (towers and main building
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
    const text = textMaker.addText(message, new Color(0xfff), followCameraRotation, followCamera);
    return text;
  }
  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Play in VR" : `Play`;

  // render();

  // Update the pointing ray
  // Update function to detect sphere pointing
  function updatePointing() {
    if (!controllers[0]) return [];
    const intersects = intersectsFromController();
    handlePointingMoving(intersects);
  }

  function intersectsFromController(): THREE.Intersection[] {
    const controller = controllers[0];
    // for (const controller of controllers) {
    const tempMatrix = new Matrix4();
    controller.updateMatrixWorld();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    const ray = new Raycaster();
    ray.camera = camera;
    ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    return ray.intersectObjects(placeSpheres);
  }

  function handlePointingMoving(intersects: THREE.Intersection[], event?: MouseEvent) {
    if (intersects.length > 0) {
      event?.preventDefault();
      const index = placeSpheres.indexOf(intersects[0].object);
      // console.log("index", index);
      const place = places[index] as CustomGroup;
      if (place) {
        setColorForAllChildren(place, selectedColor);
      }
      if (startPlace && place !== startPlace) {
        setColorForAllChildren(place, selectedColor);
        stretchLineBetweenPoints(line, startPlace.position, place.position);
      }
      if (endPlace !== place) {
        if (endPlace) {
          setColorForAllChildren(endPlace, endPlace.ud.color);
        }
        endPlace = place;
      }
    } else {
      // hide the line
      line.visible = false;
      if (endPlace) {
        setColorForAllChildren(endPlace, endPlace.ud.color);
      }
      console.log("no start intersect");
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
      // if (place.ud.owner === "player") {
      controls.enabled = false;
      startPlace = place as CustomGroup;
      isDragging = true;
      // }
    } else {
      console.log("no start intersect");
    }
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
      setColorForAllChildren(startPlace, startPlace.ud.color);
    }
    if (endPlace) {
      setColorForAllChildren(endPlace, endPlace.ud.color);
    }
    startPlace = null;
    endPlace = null;
    isDragging = false;
    line.visible = false;
  }

  function setColorForAllChildren(object: THREE.Group, color: THREE.Color) {
    object.traverse((child) => {
      if (child instanceof Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.emissive.copy(color);
        material.color.copy(color);
        material.emissiveIntensity = 0.1;
      }
    });
  }
  function updateTroopsDisplay(place: CustomGroup, troopsCount: number) {
    const intensity = Math.min(1, troopsCount / 100);
    if (place.ud.troopsDisplay) {
      // The higher the number of troops, the closer the color should be
      // to the owner's color
      // place.ud.shield.morphTargetInfluences[0] = 0.5 + 0.4 * Math.sin(troopsCount / 10);
      place.ud.troopsDisplay.updateText(
        troopsCount.toString(),
        new Color(
          place.ud.color.r * intensity,
          place.ud.color.g * intensity,
          place.ud.color.b * intensity,
        ),
      );
      place.ud.troopsDisplay.setScale(Math.min(1 + troopsCount / 100, 2));
    } else {
      place.ud.troopsDisplay = createTextSprite(troopsCount.toString(), true);
      place.ud.troopsDisplay.setPosition(
        place.position.x,
        place.position.y + 0.2,
        place.position.z,
      );
    }
    // Also reflect troop numbers in tree size
    if (place.ud.owner === "player") {
      setTreeScaleAndRotation(
        place.ud.i,
        Math.min(1, troopsCount / 100),
        // Math.sin(new Date().getTime() / 1000) * 0.5 + 0.5,
      );
    }
  }

  function generateTroops(castle: CustomGroup, timeDelta: number) {
    const sizeFactor = castle.ud.size; // Simple size measure
    // TODO temp player adv
    if (castle.ud.owner === "player") {
      castle.ud.troops += sizeFactor * timeDelta * 0.001;
    } else if (castle.ud.owner === "enemy") {
      castle.ud.troops += sizeFactor * timeDelta * 0.001;
    }
    updateTroopsDisplay(castle, Math.floor(castle.ud.troops));
  }

  function updateTroops() {
    const now = Date.now();

    for (const castle of places) {
      generateTroops(
        castle as CustomGroup,
        (castle as CustomGroup).ud.owner ? now - lastGenerationTime : 0,
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

    unitsFound.enemy = 0;
    unitsFound.player = 0;

    for (let i = 0; i < dataAgg.length; i += 4) {
      // Check if the ship has collided
      if (dataAgg[i + 3] < 0) {
        // The ship has collided
        const place = places[Math.floor((-dataAgg[i + 3] - 0.5) * WIDTH)] as CustomGroup;
        // Deduct points from the castle or perform other actions
        const shipOwner = dataAgg[i + 1] < 0.6005 ? "player" : "enemy"; // 0.6 is player, 0.601 is enemy
        if (place) {
          playRandomSoundAtPosition(shipOwner, place.position, positionalPool);
          if (!place.ud.owner || place.ud.owner !== shipOwner) {
            place.ud.troops -= 1;

            if (place.ud.troops <= 0) {
              // The castle has been conquered
              place.ud.troops = 1;
              place.ud.owner = shipOwner;
              place.ud.color = shipOwner === "player" ? playerColor : enemyColor;
              setColorForAllChildren(place as THREE.Group, place.ud.color);

              // Set target rotation
              // We will lerp towards this each frame, orientation is used for ownership graphics

              // Target rotation is PI left or PI right, depending on who the new owner is
              place.ud.targetRotation += shipOwner === "player" ? Math.PI : -Math.PI;
              place.ud.targetRotation = place.ud.targetRotation % (Math.PI * 2);
              // flips[place.id] = flips[place.id] ? flips[place.id] + 1 : 1;
            }
          } else {
            // If the end place is owned by the same player, add troops
            place.ud.troops += 1;
          }
        }

        toReset.push(i);
      } else if (dataAgg[i + 3] > 0) {
        if (dataAgg[i + 1] < 0.6005 && dataAgg[i + 1] > 0.5995) {
          unitsFound.player++;
        } else if (dataAgg[i + 1] > 0.6005 && dataAgg[i + 1] < 0.6015) {
          unitsFound.enemy++;
        }
      }
    }

    // Check if the game is over
    const planetOwners = places.map((place) => place.ud.owner);
    const playerWon =
      planetOwners.every((owner) => [null, "player"].includes(owner)) && unitsFound.enemy === 0;
    const enemyWon =
      planetOwners.every((owner) => [null, "enemy"].includes(owner)) && unitsFound.player === 0;
    if (playerWon) {
      console.log("Player won");
      const text = createTextSprite("You win!");
      // Position 2 units in front of the camera
      text?.setPosition(camera.position.x, camera.position.y, camera.position.z - 2);
      gameStarted = false;
    } else if (enemyWon) {
      const text = createTextSprite("Game over!");
      console.log("Enemy won");
      text?.setPosition(camera.position.x, camera.position.y, camera.position.z - 2);
      gameStarted = false;
    }
  }

  // This we need to do every frame
  addComputeCallback("textureAggregate", (buffer) => {
    checkForParticleArrivals(buffer);
    updateTroops();
  });

  // Animation loop
  function render(time: number) {
    controls.update();
    const delta = time - currentTime;
    currentTime = time;
    if (gameStarted) {
      gpuCompute.compute(computeCallbacks);

      const texturePosition = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
      const textureVelocity = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

      knightUniforms["texturePosition"].value = texturePosition;
      knightUniforms["textureVelocity"].value = textureVelocity;

      updatePointing();

      for (const place of places) {
        const lerpSpeed = delta / 1200;
        const distance = place.ud.targetRotation - place.rotation.x;
        if (Math.abs(distance) > 0.01) {
          // When rotation is 0, e.g. player takes place then AI takes it back
          // we need to invert the morph target.
          const invert = place.ud.targetRotation === 0;
          place.rotation.x += distance * lerpSpeed;

          const desiredMorphState = (place.ud.owner === "player" ? 1 : 0) ^ +invert;
          const morphSpeed =
            (desiredMorphState - place.ud.shield.morphTargetInfluences[0]) * lerpSpeed;
          place.ud.shield.morphTargetInfluences[0] += morphSpeed;
          place.ud.shield.morphTargetInfluences[0] = Math.min(
            Math.max(place.ud.shield.morphTargetInfluences[0], 0),
            1,
          );

          if (place.ud.owner === "player") {
            place.ud.scale = ((1 - Math.abs(distance / Math.PI)) * place.ud.troops) / 100;
          } else if (place.ud.owner === "enemy") {
            place.ud.scale = place.ud.scale - lerpSpeed;
          }
          place.ud.scale = Math.min(Math.max(place.ud.scale, 0), 1);
          setTreeScaleAndRotation(place.ud.i, place.ud.scale, place.rotation.x + Math.PI);
        }
      }
      // Check if there are places to flip (signifying being conquered)
      // A flip consists of a 180 degree rotation around the x axis
      // and of a scaling up or down the Banyan tree, depending on who
      // the new owner is
      // const flipIds = Object.keys(flips).map(Number);
      // for (const placeId of flipIds) {
      //   const place = places.find((place) => place.id === placeId);
      //   if (place) {
      //     const index = places.indexOf(place);
      //     // Scale the Banyan tree down if the new owner is the enemy
      //     const influenceDirection = place.ud.owner === "enemy" ? -1 : 1;

      //     place.ud.scale =
      //       place.ud.owner === "enemy"
      //         ? Math.max(place.ud.scale - delta / 1200, 0)
      //         : ((1 - (flips[place.id] % 1)) * place.ud.troops) / 100;

      //     place.rotation.x += Math.PI * (delta / 1200);
      //     place.ud.shield.morphTargetInfluences[0] = Math.min(
      //       Math.max(
      //         place.ud.shield.morphTargetInfluences[0] + (influenceDirection * delta) / 1200,
      //         0,
      //       ),
      //       1,
      //     );
      //     console.log("place.ud.scale", place.ud.scale);
      //     console.log(
      //       "place.ud.shield.morphTargetInfluences[0]",
      //       place.ud.shield.morphTargetInfluences[0],
      //     );

      //     // if (place.ud.owner === "enemy") {
      //     //   if (place.ud.scale > 0.0) {
      //     //     place.ud.scale -= delta / 1200;
      //     //   }
      //     // } else {
      //     //   if (place.ud.scale < 1.0) {
      //     //     place.ud.scale = ((1 - (flips[place.id] % 1)) * place.ud.troops) / 100;
      //     //   }
      //     // }

      //     // place.rotation.x += Math.PI * (delta / 1200);
      //     // place.ud.shield.morphTargetInfluences[0] = Math.max(
      //     //   Math.min(place.ud.shield.morphTargetInfluences[0] + delta / 1200, 1.0),
      //     //   0.0,
      //     // );
      //     setTreeScaleAndRotation(index, place.ud.scale, place.rotation.x + Math.PI);

      //     flips[place.id] -= delta / 1200;
      //     if (flips[place.id] <= 0) {
      //       delete flips[place.id];
      //       // Clamp to closest 180 degrees
      //       place.rotation.x = Math.round(place.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
      //     }
      //   }
      // }
    }
    if (canopyMaterial.userData.shader) {
      canopyMaterial.userData.shader.uniforms.time.value += 0.03;
    }
    if (rootMaterial.userData.shader) {
      rootMaterial.userData.shader.uniforms.time.value += 0.03;
    }
    renderer.render(scene, camera);
    drawCallPanel.update(renderer.info.render.calls, 200);
    stats.update();
  }
  renderer.setAnimationLoop(render);

  const raycaster = new Raycaster();
  const mouse = new Vector2();

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

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

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

  //
  // MOUSE EVENTS
  //
  // window.addEventListener("mousedown", onDocumentMouseDown, false);
  // window.addEventListener("mousemove", onDocumentMouseMove, false);
  // window.addEventListener("mouseup", onDocumentMouseUp, false);

  // function onDocumentMouseDown(event: MouseEvent) {
  //   mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  //   mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  //   raycaster.setFromCamera(mouse, camera);
  //   const intersects = raycaster.intersectObjects(placeSpheres);

  //   handleClickOrTriggerStart(intersects, event);
  // }

  // function onDocumentMouseMove(event: MouseEvent) {
  //   if (!isDragging) return;

  //   mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  //   mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  //   raycaster.setFromCamera(mouse, camera);
  //   const intersects = raycaster.intersectObjects(placeSpheres);
  //   handlePointingMoving(intersects);
  // }

  // async function onDocumentMouseUp(event: MouseEvent) {
  //   if (!isDragging) return;

  //   console.log("mouse up");
  //   mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  //   mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  //   raycaster.setFromCamera(mouse, camera);
  //   const intersects = raycaster.intersectObjects(placeSpheres);

  //   handleClickOrTriggerEnd(intersects, event);
  // }

  function initControllers() {
    // Handle controllers for WebXR
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      scene.add(controller);

      // Create a visual representation for the controller: a cube
      const geometry = new BoxGeometry(0.05, 0.05, 0.1);
      const material = new MeshStandardMaterial({ color: playerColor });
      const cube = new Mesh(geometry, material);
      controller.add(cube); // Attach the cube to the controller

      controllers.push(controller);
      controller.addEventListener("selectstart", onSelectStart);
      controller.addEventListener("selectend", onSelectEnd);
    }
  }

  function onSelectStart() {
    console.log("select start");
    const intersects = intersectsFromController();
    handleClickOrTriggerStart(intersects);
  }

  function onSelectEnd() {
    console.log("select end", startPlace, intersectedPlace);
    endPlace = intersectedPlace;
    const intersects = intersectsFromController();
    handleClickOrTriggerEnd(intersects);
  }

  function createPlace() {
    const place = new CustomGroup();
    // Create shield with random sizes
    // Top width should always be smaller than bottom width
    const topWidth = 1 + Math.random() * 2.0;
    const bottomWidth = 3 + Math.random() * 4.0;
    // if (topWidth > bottomWidth) {
    // [topWidth, bottomWidth] = [bottomWidth, topWidth];
    // }
    const shieldGeometry = new CylinderGeometry(bottomWidth, topWidth, 1.0, 24);
    const shieldGeometry2 = new CylinderGeometry(topWidth, bottomWidth, 1.0, 24);
    // const shieldGeometry = new THREE.TetrahedronGeometry(1.0);
    // const shieldGeometry2 = new THREE.TetrahedronGeometry(5.0);

    // Add a morph target
    shieldGeometry.morphAttributes.position = [];
    shieldGeometry.morphAttributes.normal = [];
    shieldGeometry.morphAttributes.position[0] = shieldGeometry2.attributes.position;
    shieldGeometry.morphAttributes.normal[0] = shieldGeometry2.attributes.normal;

    const shieldMaterial = new MeshStandardMaterial({ color: playerColor });
    const shield = new Mesh(shieldGeometry, shieldMaterial);
    // shield.receiveShadow = true;
    shield.morphTargetInfluences![0] = 0.5;

    shield.position.set(0, 0.0, 0);
    // shield.rotation.set(Math.PI / 2, 0, 0);
    place.add(shield);
    shieldGeometry.computeBoundingSphere();
    place.ud = place.userData;
    place.ud.size = shieldGeometry.boundingSphere?.radius;
    // Initial troops
    place.ud.troops = Math.floor(Math.random() * place.ud.size * 10);
    // Initial owner
    place.ud.owner = null;
    place.ud.scale = 0.0;
    place.ud.targetRotation = 0.0;
    place.ud.shield = shield;
    place.scale.set(0.1, 0.1, 0.1);
    return place;
  }

  async function startGame() {
    // createTextSprite("Game started!", false, true);
    if (xrSupport) {
      await xrManager.startSession();
      const ref = renderer.xr.getReferenceSpace();

      initControllers();
    }
    const music = new Music();
    music.start();

    document.getElementById("s")?.remove();
    controls.autoRotate = false;
    gameStarted = true;
    // TODO
    window.onblur = () => {
      gameStarted = false;
      togglePauseScreen();
    };
    window.onfocus = () => {
      gameStarted = true;
      togglePauseScreen();
    };
    // window.onbeforeunload = (e) => (e.returnValue = "Game in progress");
    // P pauses the game
    document.addEventListener("keydown", (e) => {
      if (e.key === "p") {
        gameStarted = !gameStarted;
      }
      togglePauseScreen();
    });
    (window as any).scene = scene;
  }
  function togglePauseScreen() {
    lastGenerationTime = Date.now();
    const style = gameStarted ? "none" : "block";
    document.getElementById("p")!.style.display = style;
  }

  const button = document.getElementById("b");
  if (button) {
    button.innerHTML = text;
    button.addEventListener("click", startGame);
  }
  const helpButton = document.getElementById("i");
  helpButton?.addEventListener("click", () => {
    document.getElementById("s")!.innerHTML = `
      The islands you've healed are green.
      Use the mouse to drag and drop the seeds of the Banyan trees from one island to another.`;
  });

  function initKnights() {
    // const baseGeometry = new THREE.PlaneGeometry(0.1, 0.1);
    // const baseGeometry = new THREE.BoxGeometry(0.2, 0.2, 2.0);
    // const baseGeometry = new THREE.TetrahedronGeometry(0.1);
    // const baseGeometry = new THREE.TorusGeometry(0.4, 0.4, 9, 9);
    const baseGeometry = new THREE.CylinderGeometry(0.2, 0, 0.9, 4, 1);
    baseGeometry.scale(0.3, 0.3, 0.3);
    baseGeometry.rotateX(-Math.PI / 2);
    // baseGeometry.scale(1, 1, 5);
    const instancedGeometry = new THREE.InstancedBufferGeometry();
    instancedGeometry.index = baseGeometry.index;
    instancedGeometry.attributes.position = baseGeometry.attributes.position;
    instancedGeometry.attributes.uv = baseGeometry.attributes.uv;

    instancedGeometry.instanceCount = PARTICLES;
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
      texturePosition: { value: null },
      textureVelocity: { value: null },
      enemyColor: { value: enemyColor },
      playerColor: { value: playerColor },
    };

    const material = new ShaderMaterial({
      uniforms: knightUniforms,
      vertexShader: knightVertex,
      fragmentShader: knightFragment,
      // transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(instancedGeometry, material, PARTICLES);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  function sendFleetFromPlaceToPlace(startPlace: CustomGroup, endPlace: CustomGroup) {
    addUnitsToTexture(startPlace.ud.troops / 2, startPlace, endPlace, startPlace.ud.owner);
  }

  function addUnitsToTexture(
    numberOfShips: number,
    startPlace: CustomGroup,
    endPlace: CustomGroup,
    owner: "player" | "enemy",
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
        const direction = new THREE.Vector3().subVectors(endPlace.position, source);
        direction.normalize();
        const index = slots[i];
        posArray[index] = source.x + Math.random() * direction.x;
        posArray[index + 1] = source.y + Math.random() * direction.y;
        posArray[index + 2] = source.z + Math.random() * direction.z;
        posArray[index + 3] = owner === "player" ? 0.6 : 0.601; // ship type
      }
      removeComputeCallback("texturePosition", positionCallback);
      dtPosition.needsUpdate = true;

      const rt = gpuCompute.getCurrentRenderTarget(positionVariable);
      // gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
      gpuCompute.renderTexture(dtPosition, rt);
      dtVelocity.needsUpdate = true;
      const rtv = gpuCompute.getCurrentRenderTarget(velocityVariable);
      gpuCompute.renderTexture(dtVelocity, rtv);

      console.log("Added units", slots.length, "to", endPlace.id, "from", source, "for", owner);
      startPlace.ud.troops -= startPlace.ud.troops / 2;
      slots.length = 0;
      unitLaunchInProgress = false;
    };

    const velocityCallback = (buffer: Float32Array) => {
      unitLaunchInProgress = true;
      // console.log("Velocity callback");
      dtVelocity.image.data.set(buffer);
      const velArray = dtVelocity.image.data;
      for (let i = 0; i < velArray.length; i += 4) {
        // Only allow 1/2 of total units per player
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
      removeComputeCallback("textureVelocity", velocityCallback);
      addComputeCallback("texturePosition", positionCallback);
    };

    addComputeCallback("textureVelocity", velocityCallback);
  }

  // Simple AI sends random units to random castles every 5 seconds
  // setInterval(() => {
  //   // Random enemy owned castle
  //   const enemyCastles = places.filter((place) => place.ud.owner && place.ud.owner !== "player");
  //   const startPlace = enemyCastles[Math.floor(Math.random() * enemyCastles.length)] as CustomGroup;
  //   const endPlace = places[Math.floor(Math.random() * places.length)] as CustomGroup;
  //   if (startPlace && endPlace && startPlace !== endPlace) {
  //     sendFleetFromPlaceToPlace(startPlace, endPlace);
  //   }
  // }, 50000);
  // setInterval(() => {
  //   // Random player owned castle
  //   const playerCastles = places.filter((place) => place.ud.owner && place.ud.owner === "player");
  //   const startPlace2 = playerCastles[
  //     Math.floor(Math.random() * playerCastles.length)
  //   ] as CustomGroup;
  //   const endPlace2 = places[Math.floor(Math.random() * places.length)] as CustomGroup;
  //   if (startPlace2 && endPlace2 && startPlace2 !== endPlace2) {
  //     sendFleetFromPlaceToPlace(startPlace2, endPlace2);
  //   }
  // }, 516);
};

init();
