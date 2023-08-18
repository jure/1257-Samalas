// import { FontLoader } from "https://unpkg.com/three@0.155.0/examples/jsm/loaders/FontLoader.js";
// import { TextGeometry } from "https://unpkg.com/three/examples/jsm/geometries/TextGeometry.js";
import XRmanager from "./XRmanager";

let intersectedPlace: THREE.Group | null = null; // The sphere currently being pointed at
let startPlace: THREE.Group | null = null; // The first sphere selected when drawing a line
let endSphere: THREE.Group | null = null; // The second sphere selected when drawing a line
let line: THREE.Line | null = null; // The line being drawn
let textMesh: THREE.Mesh; // The text mesh
const controllers: THREE.Group[] = [];

import(/* webpackIgnore: true */ "https://unpkg.com/three@0.155.0/build/three.module.js").then(
  async (THREE) => {
    // Create a scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x505050);

    // Create a camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.set(0, 1.6, 3);

    const helper = new THREE.CameraHelper(camera);
    scene.add(helper);

    // Create a renderer.
    // TODO Opportunity to gain some bytes by using the default canvas
    const canvas = document.getElementById("c") as HTMLCanvasElement;
    if (!canvas) {
      throw new Error("Could not find canvas element");
    }
    const renderer = new THREE.WebGLRenderer({
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

      document.body.appendChild(canvas);
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
    const xrSupport = await navigator.xr?.isSessionSupported("immersive-vr");
    const text = xrSupport ? "Click to start VR game" : "WebXR not supported";
    const texture = createTextTexture(text, 40, "Helvetica", "white", "black");
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const geometry = new THREE.PlaneGeometry(texture.image.width / 100, texture.image.height / 100); // Adjust size as needed
    textMesh = new THREE.Mesh(geometry, material);
    // Add helper  to text mesh
    const helper1 = new THREE.BoxHelper(textMesh, 0xffff00);
    helper1.geometry.computeBoundingBox();
    helper1.geometry.boundingBox?.getCenter(helper1.position);
    helper1.visible = true;
    scene.add(helper1);

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
      ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = ray.intersectObjects(places, true);

      if (intersects.length > 0) {
        const intersection = intersects[0];

        // Determine the castle group the intersected object belongs to
        const parentPlace = intersection.object.parent;
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
              line?.geometry.setFromPoints([startPlace.position, intersectedPlace.position]);
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
          (child.material as THREE.MeshBasicMaterial).color.copy(color);
        }
      });
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
          scene.remove(mesh);
        }
      }
    }

    // Animation loop
    function render() {
      updatePointing();
      updatePositions();
      renderer.render(scene, camera);
    }
    renderer.setAnimationLoop(render);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

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

    function initControllers() {
      // Handle controllers for WebXR
      for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        scene.add(controller);

        // Create a visual representation for the controller: a cube
        const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
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

          // Start drawing the line from this sphere
          const material = new THREE.LineBasicMaterial({ color: 0x0000ff });
          const geometry = new THREE.BufferGeometry().setFromPoints([
            startPlace.position,
            startPlace.position,
          ]); // Temporary end point
          line = new THREE.Line(geometry, material);
          scene.add(line);
        }
      }
    }

    function onSelectEnd() {
      console.log("select end", startPlace, intersectedPlace);
      endSphere = intersectedPlace;
      line && scene.remove(line);
      line = null;

      if (startPlace && endSphere) {
        // Reset for the next line draw

        // Create a cube and animate it between startPlace and endSphere
        const cubeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.position.copy(startPlace.position);
        scene.add(cube);

        cube.userData.startPosition = startPlace.position.clone();
        cube.userData.endPosition = endSphere.position.clone();
        cube.userData.startTime = Date.now();
        cube.userData.endTime = cube.userData.startTime + 1000; // 1 second

        startPlace = null;
        endSphere = null;
      }
    }

    const places: THREE.Object3D[] = [];

    function createPlace() {
      const castleGroup = new THREE.Group();

      const towers = [];
      const numTowers = Math.floor(Math.random() * 3 + 2);
      for (let i = 0; i < numTowers; i++) {
        const towerRadius = Math.random() * 1.5 + 0.5; // between 0.5 and 2 units
        const towerHeight = Math.random() * 7 + 3; // between 3 and 10 units
        const towerGeometry = new THREE.CylinderGeometry(towerRadius, towerRadius, towerHeight);
        const towerMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
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
      const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
      const mainBuilding = new THREE.Mesh(geometry, material);
      mainBuilding.rotation.x = Math.PI / 2; // So it extrudes upward
      mainBuilding.position.y = extrudeSettings.depth; // Adjust so base is on the ground

      castleGroup.add(mainBuilding);
      castleGroup.scale.set(0.1, 0.1, 0.1);
      return castleGroup;
    }

    async function startGame() {
      await xrManager.startSession();

      initControllers();
      // Logic to start the game or transition to the main game scene

      textMesh.visible = false;
      // Logic to create random places
      const sphereCount = 100; // Number of places you want to create
      for (let i = 0; i < sphereCount; i++) {
        // const radius = Math.random() * 0.5 + 0.5; // Random radius between 0.5 and 1
        // const geometry = new THREE.SphereGeometry(radius / 4, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff }); // Random color
        // const sphere = new THREE.Mesh(geometry, material);

        // Add to the scene
        const place = createPlace();
        scene.add(place);

        place.userData.color = material.color.clone(); // Save the color for later use
        setColorForAllChildren(place, place.userData.color); // Set the color for all children (towers and main building
        places.push(place);

        // Random position in the scene
        place.position.set(
          (Math.random() - 0.5) * 10, // Random X between -5 and 5
          (Math.random() - 0.5) * 10, // Random Y between -5 and 5
          (Math.random() - 0.5) * 10, // Random Z between -5 and 5
        );
        // scene.add(sphere);
      }
    }
  },
);
