
// This file can be removed if not used by another part of the application.
// For the new voice-to-voice implementation, it is not required.
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputData = input[0];
      this.port.postMessage(inputData);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
