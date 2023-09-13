varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
void main() {
  float depth = vPosition.z / 10.0;
  gl_FragColor = vec4( vColor.xyz * 0.7 + 0.3 * abs(vVelocity.xyz) * (1.0-depth), 1.0);
}