import XRmanager from "./XRmanager";
import TextMaker, { TextInstance } from "./TextMaker";
import { GPUComputationRenderer } from "./GPUComputationRenderer";
import computeVelocity from "./shaders/computeVelocity.glsl";
import computePosition from "./shaders/computePosition.glsl";
import computeAggregate from "./shaders/computeAggregate.glsl";
import knightVertex from "./shaders/knight.vertex.glsl";
import knightFragment from "./shaders/knight.fragment.glsl";
import { OrbitControls } from "./OrbitControls";

// Temp

import Stats from "three/addons/libs/stats.module.js";

let intersectedPlace: THREE.Group | null = null; // The sphere currently being pointed at
let startPlace: THREE.Group | null = null; // The first sphere selected when drawing a line
let endPlace: THREE.Group | null = null; // The second sphere selected when drawing a line
let line: THREE.Line; // The line being drawn
let textMesh: THREE.Mesh; // The text mesh
const controllers: THREE.Group[] = [];
let lastGenerationTime = Date.now();
const WIDTH = 64;
const PARTICLES = WIDTH * WIDTH;
let knightUniforms: any;

const places: THREE.Object3D[] = [];
const placeSpheres: THREE.Object3D[] = []; // Spheres for easier raycasting
let renderer: THREE.WebGLRenderer;
let gpuCompute: GPUComputationRenderer;
// const placeMetadata: { initialTroops: number; owner: null | string }[] = [];
let velocityVariable: any;
let positionVariable: any;
let aggregateVariable: any;
let textMaker: TextMaker;
const rowToTarget: boolean[] = [];
// const texts: TextInstance[] = [];
let isDragging = false;

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

const init = async () => {
  // Create a scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x505050);

  // Create a camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 3);

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  // const helper = new THREE.CameraHelper(camera);
  // scene.add(helper);

  // Create a light
  const light = new THREE.PointLight(0xffffff, 10, 100);
  light.position.set(0, 10, 0);
  scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.1);
  directionalLight.position.set(0, 1, 1);
  scene.add(directionalLight);

  // Create a renderer.
  // TODO Opportunity to gain some bytes by using the default canvas
  const canvas = document.getElementById("c") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Could not find canvas element");
  }
  renderer = new THREE.WebGLRenderer({
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

  // Create the indicator line
  // Start drawing the line from this sphere
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  line = new THREE.Line(lineGeometry, lineMaterial);
  scene.add(line);

  // Logic to create random places
  const sphereCount = 64; // Number of places you want to create
  const deltaTheta = Math.PI / Math.sqrt(sphereCount); // Divide the hemisphere vertically
  const count = 0;
  const radius = 5;

  function sphericalToCartesian(radius: number, polar: number, azimuthal: number) {
    const x = radius * Math.sin(polar) * Math.cos(azimuthal);
    const y = radius * Math.sin(polar) * Math.sin(azimuthal);
    const z = radius * Math.cos(polar);
    return new THREE.Vector3(x, y, z);
  }

  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const maxPolarAngle = Math.PI / 2; // Half-circle for hemisphere

  for (let i = 0; i < sphereCount; i++) {
    // Distribute polar angles relatively evenly by splitting max angle into even segments
    const polar = Math.acos(1 - (2 * (i + 0.5)) / sphereCount);
    //if (polar > maxPolarAngle) continue; // Skip anything beyond half-circle

    // Distribute azimuthal angles based on golden ratio
    const azimuthal = (2 * Math.PI * (i % goldenRatio)) / goldenRatio;

    const position = sphericalToCartesian(radius, polar, azimuthal);

    const place = createPlace();

    scene.add(place);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0000ff,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    if (i === 0) {
      place.userData.owner = "player";
      place.userData.color = material.color.clone(); // Save the color for later use
    } else {
      place.userData.color = new THREE.Color(0xffffff); // White
    }

    setColorForAllChildren(place, place.userData.color); // Set the color for all children (towers and main building
    places.push(place);
    // Random position in the scene
    place.position.copy(position);
    const placeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(place.userData.size / 10.0),
      material,
    );
    placeSphere.position.copy(place.position.clone().addScaledVector(place.userData.center, 0.1));
    placeSpheres.push(placeSphere);
    placeSphere.visible = false;
    scene.add(placeSphere);

    console.log(places.length);
  }

  // for (let i = 0; i < sphereCount; i++) {
  // const radius = Math.random() * 0.5 + 0.5; // Random radius between 0.5 and 1
  // const geometry = new THREE.SphereGeometry(radius / 4, 32, 32);
  // const material = new THREE.MeshStandardMaterial({
  //   color: 0x0000ff,
  //   opacity: 0.5,
  //   side: THREE.DoubleSide,
  // }); // Random color
  // // const sphere = new THREE.Mesh(geometry, material);

  // // Add to the scene
  // const place = createPlace();

  // scene.add(place);
  // if (i === 0) {
  //   place.userData.owner = "player";
  //   place.userData.color = material.color.clone(); // Save the color for later use
  // } else {
  //   place.userData.color = new THREE.Color(0xffffff); // White
  // }

  // setColorForAllChildren(place, place.userData.color); // Set the color for all children (towers and main building
  // places.push(place);
  // // Random position in the scene
  // place.position.set(
  //   (i % 10.0) * 2 - 9.0, //i / 10.0,
  //   0, //(Math.random() - 0.5) * 10, // Random X between -5 and 5
  //   (i / 10.0) * 2 - 6.0, // (Math.random() - 0.5) * 10, // Random Y between -5 and 5
  //   //(Math.random() - 0.5) * 10, // Random Z between -5 and 5
  // );
  // const placeSphere = new THREE.Mesh(
  //   new THREE.SphereGeometry(place.userData.size / 10.0),
  //   material,
  // );
  // placeSphere.position.copy(place.position);
  // placeSpheres.push(placeSphere);
  // placeSphere.visible = false;
  // scene.add(placeSphere);
  // }

  // Init compute
  initComputeRenderer();

  // Init knights
  initKnights();
  // TEST
  textMaker = new TextMaker();
  scene.add(textMaker.instancedMesh);
  // Create a couple of random texts
  // for (let i = 0; i < 256; i++) {
  //   const text2 = textMaker.addText("A".repeat(256));
  //   if (text2) {
  //     text2.setPosition(0, i / 10.0 - 14.3, -10.0);
  //     texts.push(text2);
  //   }
  // }
  // Add helper for text
  // const textHelper = new THREE.BoxHelper(text2, 0xff00ff);
  // scene.add(textHelper);

  function createTextTexture(
    text: string,
    fontSize: number,
    fontFace: string,
    textColor: string,
    bgColor: string | null,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 100 * 10;
    canvas.height = fontSize * 10;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error();
    }
    context.font = `${fontSize}px ${fontFace}`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    const textWidth = context.measureText(text).width;

    if (bgColor) {
      context.fillStyle = bgColor;
      context.fillRect(
        canvas.width / 2 - textWidth / 2,
        canvas.height / 2 - fontSize / 2,
        textWidth,
        fontSize,
      );
    }

    context.fillStyle = textColor;
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    return new THREE.CanvasTexture(canvas);
  }

  function createTextSprite(message: string) {
    const text = textMaker.addText(message);
    return text;
  }
  const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
  const text = xrSupport ? "Play in VR" : "Play";
  const texture = createTextTexture(text, 40, "Helvetica", "white", "black");
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const geometry = new THREE.PlaneGeometry(texture.image.width / 100, texture.image.height / 100); // Adjust size as needed
  textMesh = new THREE.Mesh(geometry, material);
  // Add helper  to text mesh
  // const helper1 = new THREE.BoxHelper(textMesh, 0xffff00);
  // helper1.geometry.computeBoundingBox();
  // helper1.geometry.boundingBox?.getCenter(helper1.position);
  // helper1.visible = true;
  // scene.add(helper1);

  textMesh.position.set(0, 1.6, -2);

  scene.add(textMesh);

  render();

  // Update the pointing ray
  // Update function to detect sphere pointing
  function updatePointing() {
    if (!controllers[0]) return;
    const controller = controllers[0];
    // for (const controller of controllers) {
    const tempMatrix = new THREE.Matrix4();
    const userData = controller.userData;
    controller.updateMatrixWorld();
    tempMatrix.identity().extractRotation(controller.matrixWorld);

    const ray = new THREE.Raycaster();
    ray.camera = camera;
    ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

    const intersects = ray.intersectObjects(placeSpheres);

    if (intersects.length > 0) {
      const intersection = intersects[0];

      // Determine the castle group the intersected object belongs to
      const parentPlace = places[placeSpheres.indexOf(intersection.object)];
      if (parentPlace) {
        if (!intersectedPlace || intersectedPlace !== parentPlace) {
          if (intersectedPlace) {
            // Reset color of previously intersected sphere
            setColorForAllChildren(intersectedPlace, intersectedPlace.userData.color);
          }
          intersectedPlace = parentPlace as THREE.Group;
          setColorForAllChildren(intersectedPlace, new THREE.Color(0xff0000));
        }
        if (intersectedPlace) {
          if (startPlace) {
            line.geometry.setFromPoints([startPlace.position, intersectedPlace.position]);
          }
        }
      }
    } else {
      if (intersectedPlace) {
        setColorForAllChildren(intersectedPlace, intersectedPlace.userData.color);
        intersectedPlace = null;
      }
    }
  }

  function setColorForAllChildren(object: THREE.Group, color: THREE.Color) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.emissive.copy(color);
        material.color.copy(color);
        material.emissiveIntensity = 0.1;
      }
    });
  }
  function updateCastleTroopsDisplay(castle: THREE.Group, troopsCount: number) {
    if (castle.userData.troopsDisplay) {
      // The more troops, the more red
      castle.userData.troopsDisplay.updateText(
        troopsCount.toString(),
        new THREE.Color(1, 1 - troopsCount / 100, 1 - troopsCount / 100),
      );
      castle.userData.troopsDisplay.setScale(1 + troopsCount / 100);
    } else {
      castle.userData.troopsDisplay = createTextSprite(troopsCount.toString());
      castle.userData.troopsDisplay.setPosition(
        castle.position.x,
        castle.position.y + 1,
        castle.position.z,
      );
    }
  }

  function generateTroops(castle: THREE.Group, timeDelta: number) {
    const sizeFactor = castle.userData.size; // Simple size measure
    castle.userData.troops += sizeFactor * timeDelta * 0.001;
    updateCastleTroopsDisplay(castle, Math.floor(castle.userData.troops));
  }

  function updateTroops() {
    const now = Date.now();

    for (const castle of places) {
      generateTroops(castle as THREE.Group, castle.userData.owner ? now - lastGenerationTime : 0);
    }
    lastGenerationTime = now;
  }
  function updatePositions() {
    // Find all meshes that have a startPosition, endPosition, startTime and endTime
    const meshes = scene.children.filter(
      (child: THREE.Object3D) =>
        child.userData.startPosition &&
        child.userData.endPosition &&
        child.userData.startTime &&
        child.userData.endTime,
    );
    const now = Date.now();
    for (const mesh of meshes) {
      if (now < mesh.userData.endTime) {
        const { startPosition, endPosition, startTime, endTime } = mesh.userData;
        const time = (now - startTime) / (endTime - startTime);
        const position = startPosition.clone().lerp(endPosition, time);
        console.log("lerping", position);
        mesh.position.copy(position);
      } else {
        console.log("removing cube");
        // If the end place is not owned by the same player, remove troops
        if (
          !mesh.userData.endPlace.userData.owner ||
          mesh.userData.endPlace.userData.owner !== mesh.userData.startPlace.userData.owner
        ) {
          const delta = mesh.userData.troops - mesh.userData.endPlace.userData.troops;
          if (delta > 0) {
            mesh.userData.endPlace.userData.troops = delta;
            mesh.userData.endPlace.userData.owner = mesh.userData.startPlace.userData.owner;
            mesh.userData.endPlace.userData.color = mesh.userData.startPlace.userData.color;
            setColorForAllChildren(mesh.userData.endPlace, mesh.userData.startPlace.userData.color);
          } else {
            mesh.userData.endPlace.userData.troops -= mesh.userData.troops;
          }
        } else {
          // If the end place is owned by the same player, add troops
          mesh.userData.endPlace.userData.troops += mesh.userData.troops;
        }
        scene.remove(mesh);
      }
    }
  }

  function checkForShipArrivals() {
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
    const toReset = []; // ship pixels needing reset
    for (let i = 0; i < dataAgg.length; i += 4) {
      // Check if the ship has collided
      if (dataAgg[i + 3] < 0) {
        // The ship has collided
        const place = places[Math.floor((-dataAgg[i + 3] - 0.5) * WIDTH)];
        // Deduct points from the castle or perform other actions
        if (place) {
          // TODO: Encode owner of ship in the texture
          if (!place.userData.owner || place.userData.owner !== "player") {
            place.userData.troops -= 1;
            if (place.userData.troops <= 0) {
              // The castle has been conquered
              place.userData.troops = 1;
              place.userData.owner = "player";
              place.userData.color = new THREE.Color(0x0000ff);
              setColorForAllChildren(place as THREE.Group, place.userData.color);
            }
          } else {
            // If the end place is owned by the same player, add troops
            place.userData.troops += 1;
          }
        }

        toReset.push(i);
      }
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
    gpuCompute.compute();
    const texturePosition = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    const textureVelocity = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

    knightUniforms["texturePosition"].value = texturePosition;
    knightUniforms["textureVelocity"].value = textureVelocity;

    updatePointing();
    updatePositions();
    checkForShipArrivals();
    updateTroops();
    renderer.render(scene, camera);
    stats.update();
  }
  renderer.setAnimationLoop(render);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  //
  // MOUSE EVENTS
  //
  window.addEventListener("click", onDocumentMouseClick, false);
  async function onDocumentMouseClick(event: MouseEvent) {
    event.preventDefault();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects([textMesh]);

    if (intersects.length > 0) {
      // The 'Start Game' text was clicked
      await startGame();
    }
  }

  window.addEventListener("mousedown", onDocumentMouseDown, false);
  document.addEventListener("mousemove", onDocumentMouseMove, false);
  document.addEventListener("mouseup", onDocumentMouseUp, false);

  function onDocumentMouseDown(event: MouseEvent) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    if (intersects.length > 0) {
      controls.enabled = false;
      event.preventDefault();
      const place = places[placeSpheres.indexOf(intersects[0].object)];
      startPlace = place as THREE.Group;
      isDragging = true;
    } else {
      console.log("no start intersect");
    }
  }

  function onDocumentMouseMove(event: MouseEvent) {
    if (!isDragging) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    if (intersects.length > 0) {
      event.preventDefault();
      const index = placeSpheres.indexOf(intersects[0].object);
      console.log("index", index);
      const place = places[index] as THREE.Group;
      if (place) {
        setColorForAllChildren(place, new THREE.Color(0xff0000));
      }
      if (startPlace && place !== startPlace) {
        setColorForAllChildren(place, new THREE.Color(0xff0000));
        line.geometry.setFromPoints([startPlace.position, place.position]);
      }
      if (endPlace !== place) {
        if (endPlace) {
          setColorForAllChildren(endPlace, endPlace.userData.color);
        }
        endPlace = place;
      }
    } else {
      // hide the line
      line.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      if (endPlace) {
        setColorForAllChildren(endPlace, endPlace.userData.color);
      }
      console.log("no start intersect");
    }

    // Implement your dragging visualization logic here.
    // For example, change the color of the selected sphere.
  }

  async function onDocumentMouseUp(event: MouseEvent) {
    if (!isDragging) return;

    console.log("mouse up");
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(placeSpheres);

    if (intersects.length > 0) {
      endPlace = places[placeSpheres.indexOf(intersects[0].object)] as THREE.Group;
      if (startPlace && endPlace !== startPlace) {
        console.log("startPlace attacks:", startPlace, "endPlace", endPlace);
        sendFleetFromCastleToCastle(startPlace, endPlace);
      }
    }
    controls.enabled = true;
    // Reset
    if (startPlace) {
      setColorForAllChildren(startPlace, startPlace.userData.color);
    }
    if (endPlace) {
      setColorForAllChildren(endPlace, endPlace.userData.color);
    }
    startPlace = null;
    endPlace = null;
    isDragging = false;
    line.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  }

  // Add orbit controller
  const controls = new OrbitControls(camera, renderer.domElement);

  function initControllers() {
    // Handle controllers for WebXR
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      scene.add(controller);

      // Create a visual representation for the controller: a cube
      const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.1);
      const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      const cube = new THREE.Mesh(geometry, material);
      controller.add(cube); // Attach the cube to the controller

      controllers.push(controller);
      controller.addEventListener("selectstart", onSelectStart);
      controller.addEventListener("selectend", onSelectEnd);
    }
  }

  function onSelectStart() {
    console.log("select start");
    if (intersectedPlace) {
      if (!startPlace) {
        startPlace = intersectedPlace;
      }
    }
  }

  function onSelectEnd() {
    console.log("select end", startPlace, intersectedPlace);
    endPlace = intersectedPlace;
    line.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

    if (startPlace && endPlace && startPlace !== endPlace) {
      // Reset for the next line draw

      // Create a cube and animate it between startPlace and endPlace
      const cubeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      cube.position.copy(startPlace.position);
      cube.scale.set(
        startPlace.userData.troops / 100,
        startPlace.userData.troops / 100,
        startPlace.userData.troops / 100,
      );
      // Remove half of the troops from the start place
      cube.userData.troops = startPlace.userData.troops / 2;
      startPlace.userData.troops -= cube.userData.troops;
      scene.add(cube);

      cube.userData.startPosition = startPlace.position.clone();
      cube.userData.endPosition = endPlace.position.clone();
      cube.userData.startTime = Date.now();
      cube.userData.endTime = cube.userData.startTime + 1000; // 1 second
      cube.userData.endPlace = endPlace;
      cube.userData.startPlace = startPlace;

      startPlace = null;
      endPlace = null;
    }
  }

  function createPlace() {
    const castleGroup = new THREE.Group();

    const towers = [];
    const numTowers = Math.floor(Math.random() * 3 + 2);
    let maxRadius = 0;
    for (let i = 0; i < numTowers; i++) {
      const towerRadius = Math.random() * 1.5 + 0.5; // between 0.5 and 2 units
      if (towerRadius > maxRadius) {
        maxRadius = towerRadius;
      }
      const towerHeight = Math.random() * 7 + 3; // between 3 and 10 units
      const towerGeometry = new THREE.CylinderGeometry(towerRadius, towerRadius, towerHeight);
      const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
      const tower = new THREE.Mesh(towerGeometry, towerMaterial);
      tower.position.set(Math.random() * 10 - 5, towerHeight / 2, Math.random() * 10 - 5);

      towers.push(tower.position);
      castleGroup.add(tower);
    }

    // Create the shape for the main building
    const shape = new THREE.Shape();

    // Begin with the first tower
    shape.moveTo(towers[0].x, towers[0].z);
    for (let i = 1; i < towers.length; i++) {
      shape.lineTo(towers[i].x, towers[i].z);
    }
    shape.lineTo(towers[0].x, towers[0].z); // Close the shape

    // Extrude settings and mesh creation
    const extrudeSettings = { depth: 2, bevelEnabled: false };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const mainBuilding = new THREE.Mesh(geometry, material);
    mainBuilding.rotation.x = Math.PI / 2; // So it extrudes upward
    mainBuilding.position.y = extrudeSettings.depth; // Adjust so base is on the ground
    castleGroup.add(mainBuilding);

    // Get the bounding box of the castle to use for the stand
    const sphere = new THREE.Sphere().setFromPoints(towers);
    // Get radius for box
    // Add stand for the castle, so that it's bigger than the castle itself

    sphere.radius = sphere.radius + maxRadius;
    const standGeometry = new THREE.CylinderGeometry(sphere.radius, sphere.radius, 0.1);
    const standMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const stand = new THREE.Mesh(standGeometry, standMaterial);
    stand.position.copy(sphere.center);
    stand.position.y = 0.05; // Adjust so it's on the ground
    // The size of the stand indicates the size of the castle
    castleGroup.userData.size = sphere.radius;
    // Initial troops
    castleGroup.userData.troops = Math.floor(Math.random() * sphere.radius * 10);
    // Initial owner
    castleGroup.userData.owner = null;
    castleGroup.userData.center = stand.position;

    castleGroup.add(stand);
    castleGroup.scale.set(0.1, 0.1, 0.1);
    return castleGroup;
  }

  async function startGame() {
    if (xrSupport) {
      await xrManager.startSession();
      initControllers();
    }
    // Logic to start the game or transition to the main game scene
    textMesh.visible = false;

    (window as any).scene = scene;
  }

  function getCameraConstant(camera: THREE.PerspectiveCamera) {
    return (
      window.innerHeight / (Math.tan(THREE.MathUtils.DEG2RAD * 0.5 * camera.fov) / camera.zoom)
    );
  }

  function initKnights() {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(PARTICLES * 3);
    let p = 0;

    for (let i = 0; i < PARTICLES; i++) {
      positions[p++] = 0;
      positions[p++] = 0;
      positions[p++] = 0;
    }

    const uvs = new Float32Array(PARTICLES * 2);
    p = 0;

    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        uvs[p++] = i / (WIDTH - 1);
        uvs[p++] = j / (WIDTH - 1);
      }
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    knightUniforms = {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      cameraConstant: { value: getCameraConstant(camera) },
      density: { value: 0.0 },
    };

    // THREE.ShaderMaterial
    const material = new THREE.ShaderMaterial({
      uniforms: knightUniforms,
      vertexShader: knightVertex,
      fragmentShader: knightFragment,
      transparent: true,
    });

    material.extensions.drawBuffers = true;

    const particles = new THREE.Points(geometry, material);
    particles.matrixAutoUpdate = false;
    particles.updateMatrix();

    scene.add(particles);
  }

  function sendFleetFromCastleToCastle(startPlace: THREE.Group, endPlace: THREE.Group) {
    // const startIndex = places.indexOf(startPlace);
    const endIndex = places.indexOf(endPlace);

    // const enemyCastleId =
    //   (Math.floor((Math.random() * places.length) / 2) + WIDTH / 2 + 0.5) / WIDTH + 0.5;

    const enemyCastleId = (endIndex + 0.5) / WIDTH + 0.5;
    console.log("enemyCastleId", enemyCastleId);
    addShipsToTexture(startPlace.userData.troops / 2, startPlace.position, enemyCastleId);
    startPlace.userData.troops -= startPlace.userData.troops / 2;
  }

  function addShipsToTexture(numberOfShips: number, source: THREE.Vector3, target: number) {
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
    for (let i = 0; i < posArray.length; i += 4) {
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
        posArray[i + 3] = 0.6; // ship type
        slotsFound++;

        // If we've added N slots, break
        if (slotsFound > numberOfShips - 1) {
          break;
        }
      }
    }

    console.log(dtPosition.image.data);
    console.log(dtVelocity.image.data);

    if (slotsFound < numberOfShips) {
      console.warn(`Only ${slotsFound} slots were found and updated. Requested ${numberOfShips}.`);
    }

    gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[0]);
    gpuCompute.renderTexture(dtPosition, positionVariable.renderTargets[1]);
    gpuCompute.renderTexture(dtVelocity, velocityVariable.renderTargets[0]);
    gpuCompute.renderTexture(dtVelocity, velocityVariable.renderTargets[1]);
  }
};

init();
