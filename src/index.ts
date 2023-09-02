import XRmanager from "./XRmanager";
import TextMaker from "./TextMaker";
import { GPUComputationRenderer } from "./GPUComputationRenderer";
import computeVelocity from "./shaders/computeVelocity.glsl";
import computePosition from "./shaders/computePosition.glsl";
import computeAggregate from "./shaders/computeAggregate.glsl";
import knightVertex from "./shaders/knight.vertex.glsl";
import knightFragment from "./shaders/knight.fragment.glsl";
import { OrbitControls } from "./OrbitControls";
import { playRandomSoundAtPosition } from "./sounds";
// import { LineMaterial, LineGeometry } from "./line";
import Stats from "three/addons/libs/stats.module.js";
const intersectedPlace: CustomGroup | null = null; // The sphere currently being pointed at
let startPlace: CustomGroup | null = null; // The first sphere selected when drawing a line
let endPlace: CustomGroup | null = null; // The second sphere selected when drawing a line
let line: THREE.Line; // The line being drawn
const controllers: THREE.Group[] = [];
let lastGenerationTime = Date.now();
const WIDTH = 64;
const PARTICLES = WIDTH * WIDTH;
let knightUniforms: any;

const places: CustomGroup[] = [];
const placeSpheres: THREE.Object3D[] = []; // Spheres for easier raycasting
let renderer: THREE.WebGLRenderer;
let gpuCompute: GPUComputationRenderer;
let velocityVariable: any;
let positionVariable: any;
let aggregateVariable: any;
let textMaker: TextMaker;
let isDragging = false;
let gameStarted = false;
let drawCallPanel: Stats.Panel;
const shipsFound = {
  player: 0,
  enemy: 0,
};
const {
  Texture,
  Scene,
  Color,
  PerspectiveCamera,
  IcosahedronGeometry,
  MeshBasicMaterial,
  Mesh,
  WebGLRenderer,
  PointLight,
  DirectionalLight,
  Vector3,
  Vector2,
  Raycaster,
  LineBasicMaterial,
  BufferGeometry,
  Line,
  BoxGeometry,
  ShaderMaterial,
  MeshStandardMaterial,
  AudioListener,
  PositionalAudio,
  SphereGeometry,
  Matrix4,
  CylinderGeometry,
  Group,
  MathUtils,
  BufferAttribute,
  Points,
} = THREE;

class CustomGroup extends Group {
  ud: any;
}

function fillTextures(texturePosition: THREE.DataTexture, textureVelocity: THREE.DataTexture) {
  const posArray = texturePosition.image.data;
  const velArray = textureVelocity.image.data;

  // velocityTexture.w is target castle

  for (let k = 0, kl = posArray.length; k < kl; k += 4) {
    // First row of the texture (WIDTH), is the castle locations
    if (k < (4 * WIDTH) / 2) {
      posArray[k + 0] = places[k / 4].position.x;
      posArray[k + 1] = places[k / 4].position.y;
      posArray[k + 2] = places[k / 4].position.z;
      posArray[k + 3] = 0.1; // fixed
      velArray[k + 3] = 1.0; // mass
    } else if (k < 4 * WIDTH) {
      posArray[k + 0] = places[k / 4].position.x;
      posArray[k + 1] = places[k / 4].position.y;
      posArray[k + 2] = places[k / 4].position.z;
      posArray[k + 3] = 0.1; // fixed
      velArray[k + 3] = 1.0; // mass
      // velArray is 0
    } else {
      // ships
      // Fill in texture values
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

  velocityVariable = gpuCompute.addVariable("textureVelocity", computeVelocity, dtVelocity);
  positionVariable = gpuCompute.addVariable("texturePosition", computePosition, dtPosition);
  aggregateVariable = gpuCompute.addVariable("textureAggregate", computeAggregate, dtAggregate);

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

  // Create a camera
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200);
  camera.position.set(0, 1.6, 3);

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
  const light = new PointLight(0xffffff, 100, 100);
  light.position.set(0, 0, 0);
  scene.add(light);
  const directionalLight = new DirectionalLight(0xffffff, 1.1);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  // Create a renderer.
  // TODO Opportunity to gain some bytes by using the default canvas
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Could not find canvas element");
  }
  renderer = new WebGLRenderer({
    antialias: true,
    canvas,
  });
  renderer.xr.enabled = true;
  const xrManager = new XRmanager(renderer);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Resize the canvas on window resize
  window.addEventListener("resize", function () {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.updateProjectionMatrix();
    camera.aspect = width / height;
  });

  function stretchLineBetweenPoints(line: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // Reset the cube's state to the default
    line.position.set(0, 0, 0);
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
  const lineMaterial = new MeshBasicMaterial({ color: 0x00ff00 });
  const line = new Mesh(lineGeometry, lineMaterial);
  line.visible = false;
  scene.add(line);

  // const lineMaterial = new LineMaterial({ color: 0xffffff });
  // const lineGeometry = new LineGeometry().setPositions([0, 1, 2, 4, 2, 1]);
  // line = new Line(lineGeometry, lineMaterial);
  // scene.add(line);

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
    player: [1, 2].map(() => createPositionalAudioPool(listener)),
    enemy: [1, 2].map(() => createPositionalAudioPool(listener)),
  };

  // Logic to create random places
  const sphereCount = 64; // Number of places you want to create
  const deltaTheta = Math.PI / Math.sqrt(sphereCount); // Divide the hemisphere vertically
  const count = 0;
  const radius = 5;

  function sphericalToCartesian(radius: number, polar: number, azimuthal: number) {
    const x = radius * Math.sin(polar) * Math.cos(azimuthal);
    const y = radius * Math.sin(polar) * Math.sin(azimuthal);
    const z = radius * Math.cos(polar);
    return new Vector3(x, y, z);
  }

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const maxPolarAngle = Math.PI / 2; // Half-circle for hemisphere

  // Create instanced cylinders with a shadermaterial
  const cylinderGeometry = new CylinderGeometry(0.1, 0.1, 1, 8);
  const cylinderMaterial = new MeshStandardMaterial({
    color: 0x00ff00,
  });
  const cylinderMesh = new THREE.InstancedMesh(cylinderGeometry, cylinderMaterial, sphereCount);

  for (let i = 0; i < sphereCount; i++) {
    // Distribute polar angles relatively evenly by splitting max angle into even segments
    const polar = Math.acos(1 - (2 * (i + 0.5)) / sphereCount);
    //if (polar > maxPolarAngle) continue; // Skip anything beyond half-circle

    // Distribute azimuthal angles based on golden ratio
    const azimuthal = (2 * Math.PI * (i % goldenRatio)) / goldenRatio;

    const position = sphericalToCartesian(radius, polar, azimuthal);

    const place = createPlace() as CustomGroup;

    scene.add(place);
    const material = new MeshStandardMaterial({
      color: 0x00ff00,
      opacity: 0.5,
      transparent: false,
      //side: THREE.DoubleSide,
    });
    if (i === 0) {
      place.ud.owner = "player";
      place.ud.color = material.color.clone(); // Save the color for later use
    } else if (i === sphereCount - 1) {
      place.ud.owner = "enemy";
      place.ud.color = new Color(0xff0000); // Red
    } else {
      place.ud.color = new Color(0xffffff); // White
    }

    setColorForAllChildren(place, place.ud.color); // Set the color for all children (towers and main building
    places.push(place);
    // Random position in the scene
    place.position.copy(position);
    const placeSphere = new Mesh(new SphereGeometry(place.ud.size / 10.0), material);
    placeSphere.position.copy(place.position.clone());
    placeSpheres.push(placeSphere);
    placeSphere.visible = false;
    scene.add(placeSphere);

    // console.log(places.length);
  }

  initComputeRenderer();
  initKnights();

  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);

  function createTextSprite(message: string) {
    const text = textMaker.addText(message);
    return text;
  }
  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Play in VR" : `Play`;

  render();

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
      console.log("index", index);
      const place = places[index] as CustomGroup;
      if (place) {
        setColorForAllChildren(place, new Color(0xff0000));
      }
      if (startPlace && place !== startPlace) {
        setColorForAllChildren(place, new Color(0xff0000));
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

  function handleClickOrTriggerStart(intersects: THREE.Intersection[], event?: MouseEvent) {
    if (intersects.length > 0) {
      event?.preventDefault();
      const place = places[placeSpheres.indexOf(intersects[0].object)];
      if (place.ud.owner === "player") {
        controls.enabled = false;
        startPlace = place as CustomGroup;
        isDragging = true;
      }
    } else {
      console.log("no start intersect");
    }
  }

  function handleClickOrTriggerEnd(intersects: THREE.Intersection[], event?: MouseEvent) {
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
  function updateCastleTroopsDisplay(castle: CustomGroup, troopsCount: number) {
    if (castle.ud.troopsDisplay) {
      // The higher the number of troops, the closer the color should be
      // to the owner's color
      const intensity = Math.min(1, troopsCount / 100);

      castle.ud.troopsDisplay.updateText(
        troopsCount.toString(),
        new Color(
          castle.ud.color.r * intensity,
          castle.ud.color.g * intensity,
          castle.ud.color.b * intensity,
        ),
      );
      castle.ud.troopsDisplay.setScale(Math.min(1 + troopsCount / 100, 2));
    } else {
      castle.ud.troopsDisplay = createTextSprite(troopsCount.toString());
      castle.ud.troopsDisplay.setPosition(
        castle.position.x,
        castle.position.y + 0.5,
        castle.position.z,
      );
    }
  }

  function generateTroops(castle: CustomGroup, timeDelta: number) {
    const sizeFactor = castle.ud.size; // Simple size measure
    // TODO temp player adv
    if (castle.ud.owner === "player") {
      castle.ud.troops += sizeFactor * timeDelta * 0.01;
    } else if (castle.ud.owner === "enemy") {
      castle.ud.troops += sizeFactor * timeDelta * 0.01;
    }
    updateCastleTroopsDisplay(castle, Math.floor(castle.ud.troops));
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

  function checkForParticleArrivals() {
    const target = gpuCompute.getCurrentRenderTarget(aggregateVariable);
    const size = target.width * target.height;
    const dataAgg = new Float32Array(size * 4); // Assuming RGBA format
    const aggregateRenderTarget = gpuCompute.getCurrentRenderTarget(aggregateVariable);
    renderer.readRenderTargetPixels(
      aggregateRenderTarget,
      0,
      0,
      aggregateRenderTarget.width,
      aggregateRenderTarget.height,
      dataAgg,
    );
    shipsFound.enemy = 0;
    shipsFound.player = 0;
    const toReset = []; // ship pixels needing reset
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
              place.ud.color = shipOwner === "player" ? new Color(0x00ff00) : new Color(0xff0000);
              setColorForAllChildren(place as THREE.Group, place.ud.color);
            }
          } else {
            // If the end place is owned by the same player, add troops
            place.ud.troops += 1;
          }
        }

        toReset.push(i);
      } else if (dataAgg[i + 3] > 0) {
        if (dataAgg[i + 1] < 0.6005 && dataAgg[i + 1] > 0.5995) {
          shipsFound.player++;
        } else if (dataAgg[i + 1] > 0.6005 && dataAgg[i + 1] < 0.6015) {
          shipsFound.enemy++;
        }
      }
    }

    // Check if the game is over
    const planetOwners = places.map((place) => place.ud.owner);
    const playerWon =
      planetOwners.every((owner) => [null, "player"].includes(owner)) && shipsFound.enemy === 0;
    const enemyWon =
      planetOwners.every((owner) => [null, "enemy"].includes(owner)) && shipsFound.player === 0;
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

    // Reset the velocity texture
    if (toReset.length > 0) {
      const dtVelocity = gpuCompute.createTexture();
      const velocityRenderTarget = gpuCompute.getCurrentRenderTarget(velocityVariable);
      renderer.readRenderTargetPixels(
        velocityRenderTarget,
        0,
        0,
        velocityRenderTarget.width,
        velocityRenderTarget.height,
        dtVelocity.image.data,
      );

      const velArray = dtVelocity.image.data;
      for (let i = 0; i < velArray.length; i += 4) {
        if (toReset.includes(i)) {
          velArray[i] = 0.0;
          velArray[i + 1] = 0.0;
          velArray[i + 2] = 0.0;
          velArray[i + 3] = 0.0;
        }
      }

      gpuCompute.renderTexture(dtVelocity, velocityVariable.renderTargets[0]);
      gpuCompute.renderTexture(dtVelocity, velocityVariable.renderTargets[1]);
    }
  }
  // Animation loop
  function render() {
    if (gameStarted) {
      gpuCompute.compute();
      const texturePosition = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
      const textureVelocity = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

      knightUniforms["texturePosition"].value = texturePosition;
      knightUniforms["textureVelocity"].value = textureVelocity;

      updatePointing();
      checkForParticleArrivals();
      updateTroops();
    }
    renderer.render(scene, camera);
    drawCallPanel.update(renderer.info.render.calls, 200);

    stats.update();
  }
  renderer.setAnimationLoop(render);

  const raycaster = new Raycaster();
  const mouse = new Vector2();

  //
  // MOUSE EVENTS
  //
  window.addEventListener("mousedown", onDocumentMouseDown, false);
  document.addEventListener("mousemove", onDocumentMouseMove, false);
  document.addEventListener("mouseup", onDocumentMouseUp, false);

  function onDocumentMouseDown(event: MouseEvent) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    handleClickOrTriggerStart(intersects, event);
  }

  function onDocumentMouseMove(event: MouseEvent) {
    if (!isDragging) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);
    handlePointingMoving(intersects);
  }

  async function onDocumentMouseUp(event: MouseEvent) {
    if (!isDragging) return;

    console.log("mouse up");
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    handleClickOrTriggerEnd(intersects, event);
  }

  // Add orbit controller
  const controls = new OrbitControls(camera, renderer.domElement);

  function initControllers() {
    // Handle controllers for WebXR
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      scene.add(controller);

      // Create a visual representation for the controller: a cube
      const geometry = new BoxGeometry(0.05, 0.05, 0.1);
      const material = new MeshStandardMaterial({ color: 0x00ff00 });
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

  // function createAIHome() {}

  // function createPlayerHome() {}

  function createPlace() {
    const castleGroup = new CustomGroup();

    // Create shield with random sizes
    const shieldGeometry = new CylinderGeometry(Math.random() * 7.0, Math.random() * 7.0, 1.0, 32);
    const shieldMaterial = new MeshStandardMaterial({ color: 0x00ff00 });
    const shield = new Mesh(shieldGeometry, shieldMaterial);
    shield.position.set(0, 0.0, 0);
    // shield.rotation.set(Math.PI / 2, 0, 0);
    castleGroup.add(shield);
    shieldGeometry.computeBoundingSphere();
    castleGroup.ud = castleGroup.userData;
    castleGroup.ud.size = shieldGeometry.boundingSphere?.radius;
    // Initial troops
    castleGroup.ud.troops = Math.floor(Math.random() * castleGroup.ud.size * 10);
    // Initial owner
    castleGroup.ud.owner = null;
    castleGroup.scale.set(0.1, 0.1, 0.1);
    return castleGroup;
  }

  async function startGame() {
    if (xrSupport) {
      await xrManager.startSession();
      const ref = renderer.xr.getReferenceSpace();

      initControllers();
    }

    document.getElementById("s")?.remove();
    gameStarted = true;
    (window as any).scene = scene;
  }
  const button = document.getElementById("b");
  if (button) {
    button.innerHTML = text;
    button.addEventListener("click", startGame);
  }

  function getCameraConstant(camera: THREE.PerspectiveCamera, fov?: number) {
    const f = fov || camera.fov;
    return window.innerHeight / (Math.tan(MathUtils.DEG2RAD * 0.5 * f) / camera.zoom);
  }

  function initKnights() {
    // const baseGeometry = new THREE.PlaneGeometry(0.1, 0.1);
    // const baseGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.2);
    // const baseGeometry = new THREE.TetrahedronGeometry(0.1);
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
    // const startIndex = places.indexOf(startPlace);
    const endIndex = places.indexOf(endPlace);

    const enemyCastleId = (endIndex + 0.5) / WIDTH + 0.5;
    console.log("enemyCastleId", enemyCastleId);
    addShipsToTexture(
      startPlace.ud.troops / 2,
      startPlace.position,
      enemyCastleId,
      startPlace.ud.owner,
    );
    startPlace.ud.troops -= startPlace.ud.troops / 2;
  }

  function addShipsToTexture(
    numberOfShips: number,
    source: THREE.Vector3,
    target: number,
    owner: "player" | "enemy",
  ) {
    let slotsFound = 0;
    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();

    // r is row of the texture
    // x, y, z is the position of the ship
    // target is the target castle
    const positionRenderTarget = gpuCompute.getCurrentRenderTarget(positionVariable);
    renderer.readRenderTargetPixels(
      positionRenderTarget,
      0,
      0,
      positionRenderTarget.width,
      positionRenderTarget.height,
      dtPosition.image.data,
    );
    const velocityRenderTarget = gpuCompute.getCurrentRenderTarget(velocityVariable);
    renderer.readRenderTargetPixels(
      velocityRenderTarget,
      0,
      0,
      velocityRenderTarget.width,
      velocityRenderTarget.height,
      dtVelocity.image.data,
    );

    // Log the data in dtPosition.image.data as a 64x64 {x,y,z} array
    const posArray = dtPosition.image.data;
    const velArray = dtVelocity.image.data;

    // if (posArray.includes(NaN) || velArray.includes(NaN)) {
    //   debugger;
    // }

    for (let i = 0; i < posArray.length; i += 4) {
      // Only allow 1/2 of total ships per player
      if (shipsFound[owner] >= PARTICLES / 2) {
        break;
      }
      // Check if the slot is empty
      if (velArray[i + 3] === 0) {
        // Update the slot
        velArray[i] = 0.0;
        velArray[i + 1] = 0.0;
        velArray[i + 2] = 0.0;
        velArray[i + 3] = target; // target castle id
        posArray[i] = source.x;
        posArray[i + 1] = source.y + Math.random();
        posArray[i + 2] = source.z;
        posArray[i + 3] = owner === "player" ? 0.6 : 0.601; // ship type
        slotsFound++;

        // If we've added N slots, break
        if (slotsFound > numberOfShips - 1) {
          break;
        }
      }
    }

    if (slotsFound < Math.floor(numberOfShips)) {
      console.warn(`Only ${slotsFound} slots were found and updated. Requested ${numberOfShips}.`);
    }

    gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
    gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[1]);
    gpuCompute.renderTexture(dtVelocity, velocityVariable.renderTargets[0]);
    gpuCompute.renderTexture(dtVelocity, velocityVariable.renderTargets[1]);
  }

  // Simple AI sends random ships to random castles every 5 seconds
  setInterval(() => {
    // Random enemy owned castle
    const enemyCastles = places.filter((place) => place.ud.owner && place.ud.owner !== "player");
    const startPlace = enemyCastles[Math.floor(Math.random() * enemyCastles.length)] as CustomGroup;
    const endPlace = places[Math.floor(Math.random() * places.length)] as CustomGroup;
    if (startPlace && endPlace && startPlace !== endPlace) {
      sendFleetFromPlaceToPlace(startPlace, endPlace);
    }
  }, 5000);
};

init();
