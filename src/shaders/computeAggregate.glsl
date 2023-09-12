@nomangle resolution texturePosition textureVelocity  
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 tmpPos = texture2D( texturePosition, uv );
  vec4 tmpVel = texture2D( textureVelocity, uv );
  // tmpPos = x, y, z, w = type
  // tmpVel = x, y, z velocities, w = mass or target
  gl_FragColor = vec4(tmpPos.x, tmpPos.w, tmpVel.x, tmpVel.w);
}

  