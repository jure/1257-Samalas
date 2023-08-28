@nomangle resolution texturePosition textureVelocity  
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 tmpPos = texture2D( texturePosition, uv );
  vec4 tmpVel = texture2D( textureVelocity, uv );

  gl_FragColor = vec4(tmpPos.x, tmpPos.w, tmpVel.x, tmpVel.w);
}

  