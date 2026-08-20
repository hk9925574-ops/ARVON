declare module 'say' {
  export function speak(text: string, voice?: string, speed?: number, callback?: (err: any) => void): void;
  export function stop(): void;
}
