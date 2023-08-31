@nomangle uv position modelViewMatrix projectionMatrix modelMatrix viewMatrix
// For PI declaration:
#define PI 3.141592653589793

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;
attribute vec2 dtUv;
// uniform float cameraConstant;
// uniform float density;

varying vec4 vColor;
varying vec4 vPosition;
// float radiusFromMass( float mass ) {
//   // Calculate radius of a sphere from mass and density
//   return pow( ( 3.0 / ( 4.0 * PI ) ) * mass / density, 1.0 / 3.0 );
// }

bool compareFloats(float a, float b, float epsilon) {
  return abs(a - b) < epsilon;
}

  mat3 lookAt(vec3 direction) {
      vec3 up = vec3(0.0, -1.0, 0.0);
      vec3 right = normalize(cross(up, direction));
      vec3 newUp = cross(direction, right);

      return mat3(right, newUp, direction);
  }
void main() {
  vec4 posTemp = texture2D( texturePosition, dtUv );
  vec3 pos = posTemp.xyz;
  
  vec4 velTemp = texture2D( textureVelocity, dtUv );
  vec3 vel = velTemp.xyz;
  float mass = velTemp.w;

  if(compareFloats(posTemp.w, 0.600, 0.0001)) {
    vColor = vec4( 0.0, 1.0, 0.0, 1.0 );
  } else if (compareFloats(posTemp.w,0.601, 0.0001)) {
    vColor = vec4( 1.0, 0.0, 0.0, 1.0 );
  } else {
    vColor = vec4( 1.0, 1.0, 0.0, 0.0 );
  }
  
  vColor = velTemp;
  vec3 newPos = mat3(modelMatrix) * position;



    // Assuming `vel` is your velocity or direction vector and is normalized
    mat3 orientation = lookAt(normalize(vel));

    // Transform vertex position
    newPos = orientation * newPos;
    
    newPos += pos; // Translate

  // vel.z *= -1.;
  // float xz = length( vel.xz );
  // float xyz = 1.;
  // float x = sqrt( 1. - vel.y * vel.y );

  // float cosry = vel.x / xz;
  // float sinry = vel.z / xz;

  // float cosrz = x / xyz;
  // float sinrz = vel.y / xyz;

  // mat3 maty =  mat3(
  //   cosry, 0, -sinry,
  //   0    , 1, 0     ,
  //   sinry, 0, cosry

  // );

  // mat3 matz =  mat3(
  //   cosrz , sinrz, 0,
  //   -sinrz, cosrz, 0,
  //   0     , 0    , 1
  // );

  // newPos = maty * matz * newPos;
  // newPos += pos;

  vec4 mvPosition = modelViewMatrix * (vec4( position, 1.0 ) + vec4(pos,1.0));


  // Calculate radius of a sphere from mass and density
  //float radius = pow( ( 3.0 / ( 4.0 * PI ) ) * mass / density, 1.0 / 3.0 );
  // float radius = radiusFromMass( mass );
  // if ( compareFloats(posTemp.w, .6, 0.1) ) {
  //   radius = 0.04;
  // }
  // // Apparent size in pixels
  // if ( mass == 0.0 ) {
  //   vColor = vec4( 0.0, 0.0, 0.0, 0.0 );
  //   gl_PointSize = 9.0;
  // } else {
  //   gl_PointSize = radius * 1000.0 / ( - mvPosition.z );
  // }

  gl_Position = projectionMatrix * viewMatrix * vec4(newPos, 1.0);
  vPosition = gl_Position;

}