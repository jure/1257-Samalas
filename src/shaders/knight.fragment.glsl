varying vec4 vColor;
varying vec4 vPosition;
varying vec4 vVelocity;
void main() {

  // if ( vColor.y == 0.0 ) discard;

  // float f = length( gl_PointCoord - vec2( 0.5, 0.5 ) );
  // if ( f > 0.5 ) {
    // gl_FragColor = vec4( 1.0, 0.0, 0.0, 0.0 );
    // discard;
  // }
  float depth = vPosition.z / 10.0;

  // Mix depth, velocity and color
  // gl_FragColor = vec4( vColor.xyz, 1.0 ) * depth * vVelocity;
  gl_FragColor = vec4( vColor.xyz * 0.5 + 0.5 * abs(vVelocity.xyz) * (1.0-depth), 1.0);

}