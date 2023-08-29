const sounds = {
  player: [zzfxG(...[, 0, 130.8128, , 0.02, 0.26, , 1.84, , , , , , , , , , 0.4, 0.19, 0.01])],
  enemy: [zzfxG(...[, 0, 261.6256, , 0.02, 0.26, , 1.84, , , , , , , , , , 0.4, 0.19, 0.01])],
};

// export function playRandomPlayerSound() {
//   const sound = PlayerSounds[Math.floor(Math.random() * PlayerSounds.length)];
//   zzfxP(sound);
// }

let positionalPoolIndex = 0;

export function playRandomSoundAtPosition(
  player: "player" | "enemy",
  position: THREE.Vector3,
  positionalPool: {
    enemy: THREE.PositionalAudio[];
    player: THREE.PositionalAudio[];
  },
) {
  // Get random sound
  const sound = sounds[player][Math.floor(Math.random() * sounds[player].length)];

  // Get next positional audio in line
  const positionalAudio =
    positionalPool[player][positionalPoolIndex++ % positionalPool[player].length];
  // Get AudioBufferSourceNode
  const source = zzfxB(sound);

  // Check if source is already playing
  if (!positionalAudio.isPlaying) {
    // Connect to positional audio
    positionalAudio.setBuffer(source.buffer);
    // positionalAudio.panner.positionX.setValueAtTime(position.x, zzfxX.currentTime);
    // positionalAudio.panner.positionY.setValueAtTime(position.y, zzfxX.currentTime);
    // positionalAudio.panner.positionZ.setValueAtTime(position.z, zzfxX.currentTime);

    positionalAudio.position.copy(position);
    positionalAudio.play();
  }
  // source.connect(panner);
  // panner.connect(zzfxX.destination);
  // source.start();
}
