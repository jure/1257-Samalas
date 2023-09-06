const audioContext = new AudioContext();
const sampleRate = audioContext.sampleRate;
// Function to create a basic impulse response for reverb
function createReverbIR(duration: number, decay: number) {
  const length = sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  const impulseL = impulse.getChannelData(0);
  const impulseR = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    impulseL[i] = (Math.random() * 100 - 1) * Math.pow(1 - i / length, decay);
    impulseR[i] = (Math.random() * 100 - 1) * Math.pow(1 - i / length, decay);
  }

  return impulse;
}

const reverb = audioContext.createConvolver();
reverb.buffer = createReverbIR(2, 2); // 2 seconds reverb, decay factor 2
reverb.connect(audioContext.destination);

const nodeBufferSize = 4096; // Buffer size for ScriptProcessorNode, can be 256, 512, 1024, 2048, 4096, 8192, 16384
const scriptNode = audioContext.createScriptProcessor(nodeBufferSize, 1, 1);
scriptNode.onaudioprocess = function (event) {
  const outputBuffer = event.outputBuffer;
  const outputData = outputBuffer.getChannelData(0);

  for (let i = 0; i < nodeBufferSize; i++) {
    // Using your gsound function logic here:
    outputData[i] = Math.random() * 2 - 1; // White noise

    const t =
      (1000 + (i + 2 * Math.sin(event.playbackTime) + event.playbackTime * sampleRate)) /
      sampleRate;

    // t *= 1 + 0.2*Math.sin(event.playbackTime/5.0);

    // Rolling noise volume envelope (a soft, repetitive fade in/out)
    const minIntensity = 0.2;
    const rollingEnvelope =
      minIntensity + (0.5 - minIntensity) * (1 + Math.sin(2 * Math.PI * 0.1 * t));
    // Crash volume envelope that peaks synchronously with the rolling noise
    // Use a sine wave that reaches its peak every 5 seconds, then quickly drops down
    // const crashSineValue = Math.sin(2 * Math.PI * 0.1 * t); // Adding PI/2 to make it start at peak
    const skewF = 0.96;
    const crashEnvelope =
      (2.6 +
        (1 / skewF) *
          Math.atan(
            (skewF * Math.sin((Math.PI / 5) * t - 1)) /
              (1 - skewF * Math.cos((Math.PI / 5) * t - 1)),
          )) /
        1 -
      3 * Math.abs(Math.sin((Math.PI / 10) * t - Math.PI)); // + 1*Math.abs(Math.sin(Math.PI/5*t-Math.PI))
    // const crashEnvelope = Math.exp(-5 * Math.abs(crashSineValue - 1));  // This line shapes the envelope around the peak

    outputData[i] *= 0.1 * (0.1 * rollingEnvelope + 0.1 * crashEnvelope);

    // Modulate the filter frequency with the crash envelope
    const baseFreq = 300; // Base frequency
    const freqRange = 400; // Amount by which the frequency can increase
    filter.frequency.value = baseFreq + freqRange * crashEnvelope;
  }
};
// Low pass filter
const filter = audioContext.createBiquadFilter();
filter.type = "lowpass";

filter.Q.value = 1;
scriptNode.connect(filter);
filter.connect(audioContext.destination);
// filter.connect(reverb);  // Connect the node to the audio context

let noteCount = 0;

const notes: { [key: string]: number } = {
  C: 261.63,
  "C#": 277.18,
  D: 293.66,
  "D#": 311.13,
  E: 329.63,
  F: 349.23,
  "F#": 369.99,
  G: 392.0,
  "G#": 415.3,
  A: 440.0,
  "A#": 466.16,
  B: 493.88,
};

// Pelog example
// "C": 261.63,  // Tonic
// "Dhéng": 293.66,  // Major 2nd (approx.)
// "Dhéng Bentar": 329.63,  // Major 3rd (approx.)
// "Pélog Nem": 392.0,  // Perfect 5th
// "Pélog Barang": 415.3,  // Minor 6th (approx.)
// "Pélog Lima": 440.0  // Major 6th (approx.)

for (const note in notes) {
  notes[note + "'"] = notes[note] * 2; // Using ' to denote the next octave
}

const chorusSequence = [
  "A",
  "E",
  "D",
  "E",
  "",
  "D",
  "E",
  "D",
  "C",
  "B",
  "C",
  "B",
  "",
  "C",
  "G",
  "A",
];

const chorusDurations = [
  1, 0.125, 0.125, 0.75, 0.25, 0.25, 0.25, 0.25, 1, 0.125, 0.125, 0.75, 0.5, 0.75, 0.75, 1,
];

const arpeggioDurations = [
  [0.75, 0.75, 0.25, 0.25, 0.125, 0.125, 0.75, 1],
  [0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25, 0.75],
  [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  [0.125, 0.25, 0.375, 0.75, 0.375, 0.25, 0.125, 1.75],
  // [0.125, 0.125, 0.125, 0.125, 0.75, 0.5, 0.5, 0.75],
  // [0.75, 0.75, 0.5, 0.25, 0.125, 0.125, 0.25, 0.25],
  // [0.375, 0.125, 0.375, 0.125, 0.5, 0.25, 0.125, 0.125],
  // [0.5, 0.25, 0.25, 0.5, 0.25, 0.25, 0.5, 0.5]
];

function playKick() {
  // console.log("kick", audioContext.currentTime);
  const osc = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  osc.type = "sine";

  // Start frequency at 150Hz and quickly drop it to 30Hz
  osc.frequency.setValueAtTime(80, audioContext.currentTime);
  // gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.2);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
  // Connect the gain node to a low pass filter
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(300, audioContext.currentTime);

  osc.connect(gainNode);

  gainNode.connect(filter);
  filter.connect(audioContext.destination);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.5);
  // Allowed to run again after 1 second
  scheduleAlignedTimeout(() => playKick(), 2000, audioContext.currentTime + 1);
}

function generateArpeggioSequence(rootNote: string, pattern: string): string[] {
  // Define the intervals for a major chord (root, third, fifth)
  const majorChord: { [key: number]: number } = {
    1: 0, // Root
    2: 4, // Major third
    3: 7, // Perfect fifth
    4: 12, // Octave
  };

  // Use a lookup table for note frequencies (in this case, just the C Major scale)

  // Identify the root note's index in the lookup table
  const rootIndex = Object.keys(notes).indexOf(rootNote);
  if (rootIndex === -1) {
    return [];
  }

  const sequence = [];
  for (let i = 0; i < pattern.length; i++) {
    const interval = majorChord[parseInt(pattern[i])];
    if (interval === undefined) {
      return [];
    }
    const noteIndex = rootIndex + interval;
    sequence.push(Object.keys(notes)[noteIndex]);
  }

  return sequence || [];
}

function playRandomNote() {
  // const freqValues = [262, 294, 330, 349, 392, 440, 494, 523].map(f => f / 2);

  // Play arpeggio every notes, but not on the first note
  // Chorus on every 32th note
  if (noteCount === 0 || noteCount % 48 !== 0) {
    const rootNote = Object.keys(notes)[Math.floor(Math.random() * 12)]; // C
    const arpeggioPattern = ["12132124", "34121234", "34132312", "12314321"][
      Math.floor(Math.random() * 4)
    ];
    const sequence = generateArpeggioSequence(rootNote, arpeggioPattern);
    const durations = arpeggioDurations[Math.floor(Math.random() * arpeggioDurations.length)];

    scheduleAlignedTimeout(() => playSequence(sequence, durations), 2000);
  } else if (noteCount % 48 === 0 && noteCount > 0) {
    scheduleAlignedTimeout(() => playSequence(chorusSequence, chorusDurations), 2000);
  } else {
    // const freq = freqValues[Math.floor(Math.random() * freqValues.length)];
    // const randomLength = Math.random() * 1000 + 500;
    // const randomLength2 = Math.random() * 1000 +500;
    // playNote(freq, randomLength);
    // noteCount++;
    // setTimeout(playRandomNote, randomLength);
  }
}

function playSequence(sequence: string[], durations: number[]) {
  let delay = 0;
  for (let i = 0; i < sequence.length; i++) {
    const duration = durations[i] * 1000;

    setTimeout(() => playNote(notes[sequence[i]], duration * (1 + Math.random() * 0.05)), delay);
    // Set some random delays for natural feel
    delay += duration;
  }
  setTimeout(playRandomNote, delay);
}

let currentOscillator = 0;
const numOscillators = 2;

const oscillatorPool = Array.from({ length: numOscillators }, () => {
  const oscillator = audioContext.createOscillator();
  oscillator.type = "triangle";
  const gain = audioContext.createGain();
  gain.gain.value = 0.0;
  oscillator.connect(gain);
  gain.connect(reverb);
  oscillator.start(audioContext.currentTime);
  oscillator.detune.value = 1;
  return { oscillator, gain };
});

function playNote(freq: number, duration: number) {
  // console.log(noteCount, freq, duration, audioContext.currentTime);
  noteCount++;
  if (!freq) {
    return;
  }
  const { oscillator, gain } = oscillatorPool[currentOscillator];

  const attack = 0.01;
  const decay = duration / 1000.0 / 3.5;
  const sustain = 0.8;
  const release = duration / 1000.0 / 3.5;
  const triggerTime = audioContext.currentTime;

  gain.gain.setValueAtTime(0.0, audioContext.currentTime);
  oscillator.frequency.setTargetAtTime(freq / 2, audioContext.currentTime, attack);
  gain.gain.linearRampToValueAtTime(0.8, triggerTime + attack);
  gain.gain.linearRampToValueAtTime(sustain, triggerTime + attack + decay);
  gain.gain.linearRampToValueAtTime(0.0, triggerTime + attack + decay + release);

  currentOscillator = (currentOscillator + 1) % numOscillators;
}

function scheduleAlignedTimeout(callback: () => void, interval = 2000, nextStartTime = 0) {
  const currentTime = audioContext.currentTime;
  const nextGridTime = (Math.ceil((currentTime * 1000) / interval) * interval) / 1000; // Find the next grid point
  const timeoutDuration = (nextGridTime - currentTime) * 1000; // Convert to milliseconds
  // console.log(audioContext.currentTime, nextStartTime);

  if (timeoutDuration > 1986 && nextStartTime < currentTime) {
    callback();
  } else {
    setTimeout(() => {
      callback();
    }, timeoutDuration);
  }
}

export function startMusic() {
  playRandomNote(); // Start the melody
  setTimeout(() => {
    scheduleAlignedTimeout(() => playKick(), 2000);
  }, 4000);
}
