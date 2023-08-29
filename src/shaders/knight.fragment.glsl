varying vec4 vColor;

void main() {

  // if ( vColor.y == 0.0 ) discard;

  float f = length( gl_PointCoord - vec2( 0.5, 0.5 ) );
  if ( f > 0.5 ) {
    // gl_FragColor = vec4( 1.0, 0.0, 0.0, 0.0 );
    discard;
  }
  gl_FragColor = vColor;

}