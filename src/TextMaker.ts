import vertexShader from "./textMaker.vertex.glsl";
import fragmentShader from "./textMaker.fragment.glsl";

const DEFAULT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?";
export interface TextInstance {
  setPosition: (x: number, y: number, z: number) => void;
  updateText: (message: string) => void;
  setScale: (scale: number) => void;
  instancedMesh: THREE.InstancedMesh;
  instanceId: number;
}

const {
  InstancedBufferAttribute,
  DataTexture,
  ShaderMaterial,
  InstancedMesh,
  PlaneGeometry,
  RedFormat,
  Texture,
  Object3D,
} = THREE;
export default class TextMaker {
  _texture: THREE.Texture;
  _instanceCount: number;
  _maxInstances: number;
  _maxCharsPerInstance: number;
  _lengthsBuffer: THREE.InstancedBufferAttribute;
  _instanceBuffer: THREE.InstancedBufferAttribute;
  instancedMesh: THREE.InstancedMesh;
  _characters: string;
  _messagesTexture: THREE.DataTexture;
  _data: Uint8Array;
  _dummies: THREE.Object3D[];
  _scales: number[];

  constructor(characters?: string, maxCharsPerInstance?: number, maxInstances?: number) {
    this._characters = characters || DEFAULT_CHARS;
    this._maxCharsPerInstance = maxCharsPerInstance || 128;
    this._maxInstances = maxInstances || 1024;
    this._texture = this.generateTexture();
    this._dummies = [];
    this._scales = []; // This is an additional uniform scaling factor
    this._maxInstances = 1024; // for example
    this._instanceCount = 0;
    this._lengthsBuffer = new InstancedBufferAttribute(new Float32Array(this._maxInstances), 1);
    this._instanceBuffer = new InstancedBufferAttribute(new Float32Array(this._maxInstances), 1);
    this._maxCharsPerInstance = 128;
    this._data = new Uint8Array(this._maxCharsPerInstance * this._maxInstances);
    this._messagesTexture = new DataTexture(
      this._data,
      this._maxCharsPerInstance, // width
      this._maxInstances, // height
      RedFormat,
    );

    const textShaderMaterial: THREE.ShaderMaterial = new ShaderMaterial({
      uniforms: {
        t: { value: this._texture },
        m: { value: this._messagesTexture },
      },
      vertexShader,
      // t = textTexture, m = messageTexture, l = length, c = color, u = uv, i = instance, vUv = uv
      // cp = charPos, ci = charIndex, cu = charUV, csu = charSizeUV, sx = scaleX, sy = scaleY
      // cc = charColor
      fragmentShader,
    });

    textShaderMaterial.transparent = true;
    textShaderMaterial.side = THREE.DoubleSide;
    textShaderMaterial.vertexColors = true;

    // Init the base mesh
    const planeGeometry = new PlaneGeometry(1, 0.1); // Adjust size as needed.
    // Adding instanced attributes
    planeGeometry.setAttribute("length", this._lengthsBuffer);
    planeGeometry.setAttribute("instance", this._instanceBuffer);

    this.instancedMesh = new InstancedMesh(planeGeometry, textShaderMaterial, this._maxInstances);
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

    for (let i = 0; i < this._characters.length; i++) {
      const x = size * (i % 8) + size / 2;
      const y = size * Math.floor(i / 8) + size;
      ctx.fillText(this._characters[i], x, y);
    }

    const t = new Texture(canvas);
    t.needsUpdate = true;
    return t;
  }

  updateMessageTexture(instanceId: number, message: string) {
    for (let i = 0; i < message.length; i++) {
      const charIndex = this._characters.indexOf(message[i].toUpperCase());
      if (charIndex !== -1) {
        this._data[instanceId * this._maxCharsPerInstance + i] = charIndex;
      }
    }

    this._lengthsBuffer.setX(instanceId, message.length);
    this._lengthsBuffer.needsUpdate = true;
    // Update scales
    const s = this._scales[instanceId] || 1;
    this.setScale(instanceId, (message.length * s) / 10.0, 1 * s, 1 * s);
    // Mark the texture for update on the next render
    this._messagesTexture.needsUpdate = true;
  }

  addText(message: string, color?: THREE.Color): null | TextInstance {
    const instanceId = this._instanceCount;
    // Check if we've reached the max instance count
    if (this._instanceCount >= this._maxInstances) {
      console.warn("Max instance count reached!");
      return null;
    }
    this._instanceCount++;

    this._dummies[instanceId] = new Object3D();
    // Update the data texture
    this.updateMessageTexture(instanceId, message);
    this._instanceBuffer.setX(instanceId, instanceId);
    this._instanceBuffer.needsUpdate = true;
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
        this._scales[instanceId] = s;
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
    this._dummies[instanceId].scale.set(x, y, z);
    this.updateMatrix(instanceId);
  }

  setPosition(instanceId: number, x: number, y: number, z: number) {
    this._dummies[instanceId].position.set(x, y, z);
    this.updateMatrix(instanceId);
  }

  private updateMatrix(instanceId: number) {
    this._dummies[instanceId].updateMatrix();
    this.instancedMesh.setMatrixAt(instanceId, this._dummies[instanceId].matrix);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
}
