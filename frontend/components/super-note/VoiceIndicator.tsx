import { MicrophoneIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";

interface VoiceIndicatorProps {
  isListening: boolean;
  confidence?: number;
}

export function VoiceIndicator({
  isListening,
  confidence = 0,
}: VoiceIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isListening) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      return;
    }

    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let dataArray: Uint8Array;

    const initializeAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyserRef.current = analyser;

        animate();
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    };

    const animate = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;

      if (!canvas || !analyser) return;

      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      const draw = () => {
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;

        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "rgb(20, 20, 30)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        const barWidth = (WIDTH / dataArray.length) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          barHeight = (dataArray[i] / 255) * HEIGHT;

          const hue = (i / dataArray.length) * 360;

          ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.8)`;

          ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

          x += barWidth + 1;
        }

        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    };

    initializeAudio();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
    };
  }, [isListening]);

  return (
    <div className="relative">
      <div className="flex items-center space-x-2 p-2 rounded-lg bg-dark-secondary/10">
        <div className="relative">
          <MicrophoneIcon
            className={`h-6 w-6 ${
              isListening
                ? "text-accent-primary animate-pulse"
                : "text-dark-text-secondary"
            }`}
          />
          {isListening && (
            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent-error animate-ping" />
          )}
        </div>
        <canvas ref={canvasRef} className="rounded" height={40} width={200} />
        {confidence > 0 && (
          <div className="text-sm">
            <div className="w-20 bg-dark-secondary/20 rounded-full h-2">
              <div
                className="bg-accent-primary rounded-full h-2 transition-all duration-300"
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-dark-text-secondary">
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
