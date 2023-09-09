// /* eslint-disable */
class WaveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      console.log(event.data);
      this.envelopes = eval(event.data);
    };
  }
  process(inputs, outputs, parameters) {
    // const input = inputs[0];
    const output = outputs[0];
    // const nodeBufferSize = 1024; // or whatever your buffer size is
    // const sampleRate = this.contextInfo.sampleRate;

    output.forEach((channel) => {
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1; // White noise
        if (this.envelopes) {
          const c = currentTime; // eslint-disable-line
          const s = sampleRate; // eslint-disable-line

          channel[i] *= 0.2 * (0.1 * this.envelopes(i, c, s)[0] + 0.1 * this.envelopes(i, c, s)[1]);
        }
      }
    });

    // for (let channel = 0; channel < input.length; channel++) {
    //   //   const inputData = input[channel];
    //   const outputData = output[channel];

    //   for (let i = 0; i < nodeBufferSize; i++) {
    //     outputData[i] = Math.random() * 2 - 1; // White noise

    //     const t = (1000 + (i + 2 * Math.sin(currentTime) + currentTime * sampleRate)) / sampleRate;
    //     const minIntensity = 0.2;
    //     const rollingEnvelope =
    //       minIntensity + (0.5 - minIntensity) * (1 + Math.sin(2 * Math.PI * 0.1 * t));
    //     // const crashSineValue = Math.sin(2 * Math.PI * 0.1 * t);
    //     const skewF = 0.96;
    //     const crashEnvelope =
    //       (2.6 +
    //         (1 / skewF) *
    //           Math.atan(
    //             (skewF * Math.sin((Math.PI / 5) * t - 1)) /
    //               (1 - skewF * Math.cos((Math.PI / 5) * t - 1)),
    //           )) /
    //         1 -
    //       3 * Math.abs(Math.sin((Math.PI / 10) * t - Math.PI));

    //     outputData[i] *= 0.9 * (0.1 * rollingEnvelope + 0.1 * crashEnvelope);

    //     // const baseFreq = 300;
    //     // const freqRange = 400;
    //     // filter.frequency.value = baseFreq + freqRange * crashEnvelope;
    //   }
    // }
    return true;
  }

  //   static get parameterDescriptors() {
  //     return [
  //       {
  //         name: "lowpass",
  //         defaultValue: 440,
  //         minValue: 0,
  //         maxValue: 20000,
  //         automationRate: "a-rate",
  //       },
  //     ];
  //   }
}

registerProcessor("waveProcessor", WaveProcessor);
