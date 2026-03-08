/**
 * RecordingOverlay - A simple page that displays a red border around the recording area.
 * This page is loaded in a transparent, frameless, click-through BrowserWindow.
 * No interactive elements or JavaScript logic needed.
 */
export default function RecordingOverlay() {
  return (
    <>
      <style>{`
        html, body, #__next {
          margin: 0;
          padding: 0;
          background: transparent;
          width: 100%;
          height: 100%;
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          border: "4px solid #ef4444",
          background: "transparent",
          pointerEvents: "none",
        }}
      />
    </>
  );
}
