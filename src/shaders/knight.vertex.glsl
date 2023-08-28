@nomangle uv position modelViewMatrix projectionMatrix
// For PI declaration:
#define PI 3.141592653589793

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;

uniform float cameraConstant;
uniform float density;

varying vec4 vColor;

float radiusFromMass( float mass ) {
  // Calculate radius of a sphere from mass and density
  return pow( ( 3.0 / ( 4.0 * PI ) ) * mass / density, 1.0 / 3.0 );
}

bool compareFloats(float a, float b) {
  return abs(a - b) < 0.01;
}

void main() {
  vec4 posTemp = texture2D( texturePosition, uv );
  vec3 pos = posTemp.xyz;
  
  vec4 velTemp = texture2D( textureVelocity, uv );
  vec3 vel = velTemp.xyz;
  float mass = velTemp.w;

  if(compareFloats(posTemp.w,0.6)) {
    vColor = vec4( 1.0, .647, 0., 1.0 );
  } else {
    vColor = vec4( 1.0, 1.0, 1.0, 0.0 );
  }

  vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );

  // Calculate radius of a sphere from mass and density
  //float radius = pow( ( 3.0 / ( 4.0 * PI ) ) * mass / density, 1.0 / 3.0 );
  float radius = radiusFromMass( mass );
  if ( compareFloats(posTemp.w, .6) ) {
    radius = 0.04;
  }
  // Apparent size in pixels
  if ( mass == 0.0 ) {
    vColor = vec4( 0.0, 0.0, 0.0, 0.0 );
    gl_PointSize = 0.0;
  } else {
    gl_PointSize = radius * cameraConstant / ( - mvPosition.z );
  }

  gl_Position = projectionMatrix * mvPosition;
}