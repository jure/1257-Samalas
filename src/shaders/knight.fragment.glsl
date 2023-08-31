varying vec4 vColor;
varying vec4 vPosition;
void main() {

  // if ( vColor.y == 0.0 ) discard;

  // float f = length( gl_PointCoord - vec2( 0.5, 0.5 ) );
  // if ( f > 0.5 ) {
    // gl_FragColor = vec4( 1.0, 0.0, 0.0, 0.0 );
    // discard;
  // }
  float depth = vPosition.z / 10.0;
  // discard if depth is greater than 1.0

  // gl_FragColor = vec4(depth, depth, depth, 1.0);
  gl_FragColor = vColor;
}