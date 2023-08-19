const characters = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?";
export default class TextMaker {
  T: any; // This is THREE, but we can't import it directly.
  texture: THREE.Texture;
  texts: any[];

  constructor(T: any) {
    this.T = T;
    this.texture = this.generateTexture();
    this.texts = [];
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

    for (let i = 0; i < characters.length; i++) {
      const x = size * (i % 8) + size / 2;
      const y = size * Math.floor(i / 8) + size;
      ctx.fillText(characters[i], x, y);
    }

    const textTexture = new this.T.Texture(canvas);
    textTexture.needsUpdate = true;
    return textTexture;
  }

  makeText(message: string) {
    const planeGeometry = new this.T.PlaneGeometry(1, 1); // Adjust size as needed.

    const textShaderMaterial: THREE.ShaderMaterial = new this.T.ShaderMaterial({
      uniforms: {
        textTexture: { value: this.texture },
        message: { value: null }, // We'll update this for each message.
        length: { value: message.length },
        color: { value: new this.T.Vector4(1, 1, 1, 1) },
      },
      vertexShader: `
          varying vec2 u;
  
          void main() {
              u = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
      `,
      // uniform sampler2D textTexture;
      // uniform float message[100];
      // uniform float length;
      // uniform vec4 color;
      // varying vec2 vUv;

      // void main() {
      //   // Which character from the message are we currently on.
      //   int charPos = int(floor(mod(vUv.x * length, 100.0)));

      //   // Get the character's index from the message.
      //   float charIndex = message[charPos];

      //   // Convert that index into UV coordinates on the textTexture.
      //   vec2 charUV;
      //   float charSizeUV = 0.125;  // 64 pixels / 512 pixels

      //   // Determine the character's position in the texture.
      //   float row = floor(charIndex / 8.0);
      //   float col = mod(charIndex, 8.0);
      //   float scaleX = vUv.x * length * charSizeUV;
      //   float scaleY = (-vUv.y * 0.10 + 0.11);

      //   // Convert row and column into UV coordinates.
      //   charUV.x = col * charSizeUV + mod(scaleX, charSizeUV);
      //   charUV.y = (1.0 - row * charSizeUV) - mod(scaleY, charSizeUV);  // Subtracting since y is inverted in textures.

      //   // Fetch the color from the textTexture and output it.
      //   vec4 charColor = texture2D(textTexture, charUV);

      //   // If the alpha value of the charColor is below a threshold, discard the fragment.
      //   if (charColor.a < 0.2) discard;

      //   gl_FragColor = (charColor) * color;
      // }
      fragmentShader: `
      uniform sampler2D textTexture;
      uniform float message[100];
      uniform float length;
      uniform vec4 color;
      varying vec2 u;
      
      void main() {
        // Which character from the message are we currently on.
        int charPos = int(floor(mod(u.x * length, 100.0)));

        // Get the character's index from the message.
        float charIndex = message[charPos];
    
        // Convert that index into UV coordinates on the textTexture.
        vec2 charUV;
        float charSizeUV = 0.125;  // 64 pixels / 512 pixels
        
        // Determine the character's position in the texture.
        float row = floor(charIndex / 8.0);
        float col = mod(charIndex, 8.0);
        float scaleX = u.x * length * charSizeUV;
        float scaleY = (-u.y * 0.10 + 0.11);

        // Convert row and column into UV coordinates.
        charUV.x = col * charSizeUV + mod(scaleX, charSizeUV);
        charUV.y = (1.0 - row * charSizeUV) - mod(scaleY, charSizeUV);  // Subtracting since y is inverted in textures.

        // Fetch the color from the textTexture and output it.
        vec4 charColor = texture2D(textTexture, charUV);
    
        // If the alpha value of the charColor is below a threshold, discard the fragment.
        if (charColor.a < 0.2) discard;
    
        gl_FragColor = (charColor) * color;
      }
      `,
    });

    textShaderMaterial.uniforms.message.value = this.makeShaderText(message);
    textShaderMaterial.transparent = true;
    textShaderMaterial.side = this.T.DoubleSide;
    const textPlane = new this.T.Mesh(planeGeometry, textShaderMaterial);

    // TEST
    const rand = Math.random();
    setInterval(() => {
      const num = 5 + 5 * Math.sin(Date.now() / 1000) * rand;
      const newMessage = num.toFixed(num);
      textShaderMaterial.uniforms.message.value = this.makeShaderText(newMessage);
      textShaderMaterial.uniforms.length.value = newMessage.length;
      textShaderMaterial.uniforms.color.value = new this.T.Vector4(num / 10.0, 0, 1, 1);
      textPlane.scale.x = newMessage.length / 10.0;
      textPlane.scale.y = 0.1;
      textPlane.rotateY(0.01);
    }, 16);

    return textPlane;
  }

  makeShaderText(message: string) {
    // Convert the message string to a format that the shader understands.
    const messageData = new Float32Array(100); // Based on the example size above.
    for (let i = 0; i < message.length; i++) {
      const charIndex = characters.indexOf(message[i].toUpperCase());
      if (charIndex !== -1) {
        messageData[i] = charIndex;
      }
    }

    return messageData;
  }

  updateText(textPlane: THREE.Mesh, message: string) {
    (textPlane.material as THREE.ShaderMaterial).uniforms.message.value =
      this.makeShaderText(message);
    (textPlane.material as THREE.ShaderMaterial).uniforms.length.value = message.length;
  }
}
