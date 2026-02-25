// Script to generate sound effects for Abby
// Run with: node generate-sounds.js

const fs = require('fs');
const path = require('path');
const { AudioContext, AudioBuffer } = require('web-audio-api');

function generateTone(context, frequency, duration, type = 'sine') {
  const sampleRate = context.sampleRate;
  const samples = duration * sampleRate;
  const buffer = context.createBuffer(1, samples, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    switch (type) {
      case 'sine':
        data[i] = Math.sin(2 * Math.PI * frequency * t);
        break;
      case 'square':
        data[i] = Math.sign(Math.sin(2 * Math.PI * frequency * t));
        break;
      case 'sawtooth':
        data[i] = 2 * (t * frequency - Math.floor(0.5 + t * frequency));
        break;
    }
    // Apply envelope
    const attack = 0.1;
    const release = 0.2;
    if (t < attack) {
      data[i] *= t / attack; // Attack
    } else if (t > duration - release) {
      data[i] *= (duration - t) / release; // Release
    }
  }

  return buffer;
}

function createActivationSound(context) {
  // Gentle ascending chime
  const duration = 0.2;
  const buffer = context.createBuffer(1, duration * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);

  const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
  frequencies.forEach((freq, index) => {
    const startTime = index * 0.05;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / context.sampleRate;
      if (t >= startTime && t < startTime + 0.15) {
        const phase = t - startTime;
        const envelope = Math.sin(Math.PI * phase / 0.15);
        data[i] += envelope * Math.sin(2 * Math.PI * freq * t) * 0.3;
      }
    }
  });

  return buffer;
}

function createProcessingSound(context) {
  // Subtle tick sound
  const duration = 0.1;
  const buffer = context.createBuffer(1, duration * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);

  const frequency = 1000;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / context.sampleRate;
    const envelope = Math.exp(-30 * t);
    data[i] = envelope * Math.sin(2 * Math.PI * frequency * t) * 0.2;
  }

  return buffer;
}

function createErrorSound(context) {
  // Soft descending tone
  const duration = 0.3;
  const buffer = context.createBuffer(1, duration * context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);

  const startFreq = 440;
  const endFreq = 220;
  for (let i = 0; i < buffer.length; i++) {
    const t = i / context.sampleRate;
    const freq = startFreq + (endFreq - startFreq) * (t / duration);
    const envelope = Math.sin(Math.PI * t / duration);
    data[i] = envelope * Math.sin(2 * Math.PI * freq * t) * 0.3;
  }

  return buffer;
}

function saveBufferToWav(buffer, filePath) {
  // Simple WAV file format implementation
  const format = {
    sampleRate: buffer.sampleRate,
    channels: 1,
    bitDepth: 16
  };

  const dataLength = buffer.length * format.channels * (format.bitDepth / 8);
  const fileLength = 44 + dataLength;
  const headerBuffer = Buffer.alloc(44);

  // WAV header
  headerBuffer.write('RIFF', 0);
  headerBuffer.writeUInt32LE(fileLength - 8, 4);
  headerBuffer.write('WAVE', 8);
  headerBuffer.write('fmt ', 12);
  headerBuffer.writeUInt32LE(16, 16);
  headerBuffer.writeUInt16LE(1, 20);
  headerBuffer.writeUInt16LE(format.channels, 22);
  headerBuffer.writeUInt32LE(format.sampleRate, 24);
  headerBuffer.writeUInt32LE(format.sampleRate * format.channels * (format.bitDepth / 8), 28);
  headerBuffer.writeUInt16LE(format.channels * (format.bitDepth / 8), 32);
  headerBuffer.writeUInt16LE(format.bitDepth, 34);
  headerBuffer.write('data', 36);
  headerBuffer.writeUInt32LE(dataLength, 40);

  // Convert float32 audio data to int16
  const data = buffer.getChannelData(0);
  const samples = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    samples.writeInt16LE(sample * 0x7FFF, i * 2);
  }

  // Write WAV file
  const fileBuffer = Buffer.concat([headerBuffer, samples]);
  fs.writeFileSync(filePath, fileBuffer);
}

async function main() {
  const context = new AudioContext();
  const soundsDir = path.join(__dirname, '../public/sounds');

  // Create sounds directory if it doesn't exist
  if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir, { recursive: true });
  }

  // Generate and save sounds
  const sounds = {
    activation: createActivationSound(context),
    processing: createProcessingSound(context),
    error: createErrorSound(context)
  };

  for (const [name, buffer] of Object.entries(sounds)) {
    const filePath = path.join(soundsDir, `${name}.wav`);
    saveBufferToWav(buffer, filePath);
    console.log(`Generated ${name} sound: ${filePath}`);
  }

  console.log('All sound files generated successfully!');
  process.exit(0);
}

main().catch(console.error);
