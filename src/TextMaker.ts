const DEFAULT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?";
export interface TextInstance {
  setPosition: (x: number, y: number, z: number) => void;
  updateText: (message: string) => void;
  setScale: (scale: number) => void;
  instancedMesh: THREE.InstancedMesh;
  instanceId: number;
}
export default class TextMaker {
  texture: THREE.Texture;
  instanceCount: number;
  maxInstances: number;
  maxCharsPerInstance: number;
  lengthsBuffer: THREE.InstancedBufferAttribute;
  instanceBuffer: THREE.InstancedBufferAttribute;
  instancedMesh: THREE.InstancedMesh;
  characters: string;
  messagesTexture: THREE.DataTexture;
  data: Uint8Array;
  dummies: THREE.Object3D[];
  scales: number[];

  constructor(characters?: string, maxCharsPerInstance?: number, maxInstances?: number) {
    this.characters = characters || DEFAULT_CHARS;
    this.maxCharsPerInstance = maxCharsPerInstance || 128;
    this.maxInstances = maxInstances || 1024;
    this.texture = this.generateTexture();
    this.dummies = [];
    this.scales = []; // This is an additional uniform scaling factor
    this.maxInstances = 1024; // for example
    this.instanceCount = 0;
    this.lengthsBuffer = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances), 1);
    this.instanceBuffer = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxInstances),
      1,
    );
    this.maxCharsPerInstance = 128;
    this.data = new Uint8Array(this.maxCharsPerInstance * this.maxInstances);
    this.messagesTexture = new THREE.DataTexture(
      this.data,
      this.maxCharsPerInstance, // width
      this.maxInstances, // height
      THREE.RedFormat,
    );

    const textShaderMaterial: THREE.ShaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        t: { value: this.texture },
        m: { value: this.messagesTexture },
      },
      vertexShader: `
          attribute float length;
          attribute float instance;
          varying vec2 u;
          varying vec3 c;
          varying float l;
          varying float i;

          void main() {
              u = uv;
              l = length;
              #ifdef USE_INSTANCING_COLOR
                c = instanceColor;
              #endif
              i = instance;
              gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
      `,
      // t = textTexture, m = messageTexture, l = length, c = color, u = uv, i = instance, vUv = uv
      // cp = charPos, ci = charIndex, cu = charUV, csu = charSizeUV, sx = scaleX, sy = scaleY
      // cc = charColor
      fragmentShader: `
      uniform sampler2D t;
      uniform sampler2D m;
      varying float l; // length  
      varying vec3 c; // color
      varying vec2 u;
      varying float i;
      
      void main() {
        int cp = int(floor(mod(u.x * l, 128.0)));
        vec2 messageUV = vec2(
          float(cp) / float(${this.maxCharsPerInstance}),
          i  / float(${this.maxInstances})
        );
        float ci = texture2D(m, messageUV).r * 255.0;
        vec2 cu;
        float csu = 0.125;  // 64 pixels / 512 pixels
        float row = floor(ci / 8.0);
        float col = mod(ci, 8.0);
        float sx = u.x * l * csu;
        float sy = (-u.y * 0.10 + 0.11);
        cu.x = col * csu + mod(sx, csu);
        cu.y = (1.0 - row * csu) - mod(sy, csu);
        vec4 cc = texture2D(t, cu);
        if (cc.a < 0.2) discard;
        gl_FragColor = (cc) * vec4(c, 1.0);
      }
      `,
    });

    textShaderMaterial.transparent = true;
    textShaderMaterial.side = THREE.DoubleSide;
    textShaderMaterial.vertexColors = true;

    // Init the base mesh
    const planeGeometry = new THREE.PlaneGeometry(1, 0.1); // Adjust size as needed.
    // Adding instanced attributes
    planeGeometry.setAttribute("length", this.lengthsBuffer);
    planeGeometry.setAttribute("instance", this.instanceBuffer);

    this.instancedMesh = new THREE.InstancedMesh(
      planeGeometry,
      textShaderMaterial,
      this.maxInstances,
    );
    this.instancedMesh.frustumCulled = false;
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  generateTexture() {
    const canvasSize = 512; // You can adjust this for better resolution.
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error();

    const size = 64;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = `${size}px monospace`; // Adjust font size to fit within the canvas.
    ctx.fillStyle = "white";

    for (let i = 0; i < this.characters.length; i++) {
      const x = size * (i % 8) + size / 2;
      const y = size * Math.floor(i / 8) + size;
      ctx.fillText(this.characters[i], x, y);
    }

    const t = new THREE.Texture(canvas);
    t.needsUpdate = true;
    return t;
  }

  updateMessageTexture(instanceId: number, message: string) {
    for (let i = 0; i < message.length; i++) {
      const charIndex = this.characters.indexOf(message[i].toUpperCase());
      if (charIndex !== -1) {
        this.data[instanceId * this.maxCharsPerInstance + i] = charIndex;
      }
    }

    this.lengthsBuffer.setX(instanceId, message.length);
    this.lengthsBuffer.needsUpdate = true;
    // Update scales
    const s = this.scales[instanceId] || 1;
    this.setScale(instanceId, (message.length * s) / 10.0, 1 * s, 1 * s);
    // Mark the texture for update on the next render
    this.messagesTexture.needsUpdate = true;
  }

  addText(message: string, color?: THREE.Color): null | TextInstance {
    const instanceId = this.instanceCount;
    // Check if we've reached the max instance count
    if (this.instanceCount >= this.maxInstances) {
      console.warn("Max instance count reached!");
      return null;
    }
    this.instanceCount++;

    this.dummies[instanceId] = new THREE.Object3D();
    // Update the data texture
    this.updateMessageTexture(instanceId, message);
    this.instanceBuffer.setX(instanceId, instanceId);
    this.instanceBuffer.needsUpdate = true;
    color && this.setColor(instanceId, color);

    // Return the instanceId for future updates and increment for the next use
    return {
      setPosition: (x: number, y: number, z: number) => {
        this.setPosition(instanceId, x, y, z);
      },
      updateText: (message: string, color?: THREE.Color) => {
        this.updateMessageTexture(instanceId, message);
        color && this.setColor(instanceId, color);
      },
      setScale: (s: number) => {
        this.scales[instanceId] = s;
      },
      instancedMesh: this.instancedMesh,
      instanceId,
    };
  }
  setColor(instanceId: number, color: THREE.Color) {
    this.instancedMesh.setColorAt(instanceId, color);
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  setScale(instanceId: number, x: number, y: number, z: number) {
    this.dummies[instanceId].scale.set(x, y, z);
    this.updateMatrix(instanceId);
  }

  setPosition(instanceId: number, x: number, y: number, z: number) {
    this.dummies[instanceId].position.set(x, y, z);
    this.updateMatrix(instanceId);
  }

  private updateMatrix(instanceId: number) {
    this.dummies[instanceId].updateMatrix();
    this.instancedMesh.setMatrixAt(instanceId, this.dummies[instanceId].matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
