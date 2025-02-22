export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  readonly confidence: number;
  readonly transcript: string;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: {
      readonly isFinal?: boolean;
      readonly length: number;
      [index: number]: SpeechRecognitionAlternative;
    };
  };
}

export interface SpeechGrammar {
  src: string;
  weight: number;
}

export interface SpeechGrammarList {
  readonly length: number;
  addFromString(string: string, weight?: number): void;
  addFromURI(src: string, weight?: number): void;
  item(index: number): SpeechGrammar;
  [index: number]: SpeechGrammar;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: SpeechGrammarList;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((event: Event) => void) | null;
  onaudiostart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((event: SpeechRecognitionEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onsoundend: ((event: Event) => void) | null;
  onsoundstart: ((event: Event) => void) | null;
  onspeechend: ((event: Event) => void) | null;
  onspeechstart: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognition;
    webkitSpeechRecognition?: SpeechRecognition;
    SpeechGrammarList?: SpeechGrammarList;
    webkitSpeechGrammarList?: SpeechGrammarList;
  }
}

