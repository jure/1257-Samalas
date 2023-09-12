const gsound = (e: number, V: number) => {
  // Synth adapted from Xem's Minisynth
  const D = [];
  for (let i = 0; i < 44100 * V; i++) {
    // V: note length in seconds
    // This function generates the i'th sample of a sinusoidal signal with a specific frequency and amplitude
    const b = (e: number, t: number, a: number, i: number) => Math.sin((e / t) * 6.28 * a + i);
    // Instrument synthesis
    const w = (e: number, t: number) =>
      Math.sin(
        (e / 44100) * t * 6.28 +
          b(e, 44100, t, 0) ** 3 +
          0.75 * b(e, 44100, t, 0.25) +
          0.1 * b(e, 44100, t, 0.5),
      );

    // Fill the samples array
    D[i] =
      // The first 88 samples represent the note's attack
      i < 88
        ? (i / 88.2) * w(i, e)
        : // The other samples represent the rest of the note
          (1 - (i - 88.2) / (44100 * (V - 0.002))) ** ((0.5 * Math.log((1e4 * e) / 44100)) ** 2) *
          w(i, e);
  }
  return D;
};
const ac = new window.AudioContext();

const now = Date.now();

const getBuffer = (D: any[]) => {
  const e = ac.createBufferSource();
  const f = ac.createBuffer(1, D.length, 44100);
  f.getChannelData(0).set(D);
  e.buffer = f;
  return e;
};

// Frequencies for one octave
const frequencies = [609, 653, 705, 822, 887, 954, 1050].map((f) => f / 8);
// Generate three octaves

const sounds: AudioBufferSourceNode[] = [];
for (let i = -1; i < 3; i++) {
  sounds.push(...frequencies.map((f) => getBuffer(gsound(f * Math.pow(2, i), 0.05))));
}

const patterns = [
  [13],
  [13],
  [13],
  // [13, 14],
  // [13, 14],
  // [13, 14],
  // [1, 2, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6],
  // [4, 5, 6, 4, 5, 6, 4, 5, 6, 7, 5, 6, 4, 5, 4, 3, 5, 4, 3, 2, 1],
  // [3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 1, 2, 3],
];
const composition = [0, 1, 2, 1, 2, 1, 0];

// Bass patterns, batterns :wink:
const batterns = [
  [6],
  [6],
  [6],
  // [8, 9, 7],
  // [8, 9, 6],
  // [8, 9, 8],
  // [1, 2, 1],
  // [2, 2, 1],
  // [3, 1, 2],
];
const notes = {
  player: composition.map((i) => patterns[i]).flat(),
  enemy: composition.map((i) => batterns[i]).flat(),
};
// const notes = composition.map((i) => patterns[i]).flat();

// function playNotes(index: number) {
//   if (index < notes.length) {
//     // f = 130.81 * 1.06 ** notes[index];
//     let f = frequencies[notes[index] % 6];
//     // We have to adjust to the octave
//     f = f * Math.pow(2, Math.floor(notes[index] / 6));
//     note(f, 0.1);
//     const maybePause = Math.random() > 0.5;
//     setTimeout(() => playNotes(index + 1), maybePause ? 100 : 200); // 2000ms or 2 seconds interval
//   }
// }
// document.getElementById("b")!.onclick = () => playNotes(0);

// const sounds = {
//   player: [zzfxG(...[, 0, 130.8128, , 0.02, 0.26, , 1.84, , , , , , , , , , 0.4, 0.19, 0.01])],
//   enemy: [zzfxG(...[, 0, 261.6256, , 0.02, 0.26, , 1.84, , , , , , , , , , 0.4, 0.19, 0.01])],
// };

// export function playRandomPlayerSound() {
//   const sound = PlayerSounds[Math.floor(Math.random() * PlayerSounds.length)];
//   zzfxP(sound);
// }
// The player and enemy play their individual melodies
const currentNotes = {
  player: 0,
  enemy: 0,
};

let positionalPoolIndex = 0;

const done = false;
export function playRandomSoundAtPosition(
  player: "player" | "enemy",
  position: THREE.Vector3,
  positionalPool: {
    enemy: THREE.PositionalAudio[];
    player: THREE.PositionalAudio[];
  },
) {
  // Get next note

  // Get sound for note

  // const sound = sounds[note + 6];
  // Get next positional audio in line
  // Get AudioBufferSourceNode
  // Check if source is already playing
  // if (!done) {
  //   // gsound(609, 2.0);
  //   done = true;
  //   setTimeout(() => {
  //     done = false;
  //   }, 2000);
  // }

  // Connect to positional audio
  // console.log("Outside", source.buffer);
  // Only start playing on regular interval
  setTimeout(
    () => {
      const positionalAudio =
        positionalPool[player][positionalPoolIndex++ % positionalPool[player].length];

      // Is any positional audio playing?
      const playing = positionalPool[player].some((p) => p.isPlaying);
      if (!playing) {
        positionalAudio.position.copy(position);

        let note = notes[player][currentNotes[player]++ % notes[player].length];
        note += player === "player" ? 6 : 0;

        const source = sounds[note + 6];

        source.buffer && positionalAudio.setBuffer(source.buffer);

        positionalAudio.play();
      }
    },
    50 - ((Date.now() - now) % 50),
  );
}
