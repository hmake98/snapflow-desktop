export type RecordingState = "idle" | "selecting" | "recording";

export interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnail: string;
  displayBounds?: { x: number; y: number; width: number; height: number };
}

/**
 * RecorderService manages recording state machine.
 * Decouples state management from background.ts global variables.
 * Does NOT contain recording logic — that stays in captureService.
 */
export class RecorderService {
  private state: RecordingState = "idle";

  getState(): RecordingState {
    return this.state;
  }

  setState(newState: RecordingState): void {
    this.state = newState;
  }
}

export const recorderService = new RecorderService();
