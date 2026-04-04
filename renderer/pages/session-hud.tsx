import React, { useEffect, useState, useRef } from "react";

interface SessionStatus {
  elapsed: number; // ms
  screenshots: number;
  events: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function SessionHud() {
  const [status, setStatus] = useState<SessionStatus>({
    elapsed: 0,
    screenshots: 0,
    events: 0,
  });
  const [capturing, setCapturing] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Listen for live status pushes from main process
    const unsub = window.ipc.on(
      "session:status",
      (data: SessionStatus) => {
        setStatus(data);
      }
    );
    unsubRef.current = unsub as () => void;

    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const handleCapture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      await window.api.sessionTakeScreenshot();
    } finally {
      setCapturing(false);
    }
  };

  const handleStop = async () => {
    await window.api.sessionStop();
  };

  return (
    <>
      <style jsx global>{`
        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          overflow: hidden !important;
          user-select: none;
          -webkit-user-select: none;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <div
          style={{
            background: "rgba(15, 15, 15, 0.92)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            minWidth: "260px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          {/* Recording indicator dot */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 6px #ef4444",
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            />
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
              }
            `}</style>
            <span
              style={{
                color: "#ffffff",
                fontSize: "13px",
                fontFamily: "monospace",
                fontWeight: 600,
                letterSpacing: "0.5px",
              }}
            >
              {formatElapsed(status.elapsed)}
            </span>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "1px",
              height: "20px",
              background: "rgba(255,255,255,0.15)",
            }}
          />

          {/* Stats */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              title="Screenshots captured"
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "13px" }}>📸</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>
                {status.screenshots}
              </span>
            </span>
            <span
              title="Events tracked"
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "13px" }}>⚡</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>
                {status.events}
              </span>
            </span>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "1px",
              height: "20px",
              background: "rgba(255,255,255,0.15)",
            }}
          />

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={handleCapture}
              disabled={capturing}
              title="Take screenshot (Ctrl+Shift+S)"
              style={{
                background: capturing
                  ? "rgba(59,130,246,0.3)"
                  : "rgba(59,130,246,0.2)",
                border: "1px solid rgba(59,130,246,0.5)",
                borderRadius: "6px",
                color: "#93c5fd",
                fontSize: "11px",
                fontWeight: 600,
                padding: "4px 10px",
                cursor: capturing ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
              }}
            >
              <span>📷</span>
              <span>{capturing ? "…" : "Snap"}</span>
            </button>

            <button
              onClick={handleStop}
              title="Stop session and review"
              style={{
                background: "rgba(239,68,68,0.2)",
                border: "1px solid rgba(239,68,68,0.5)",
                borderRadius: "6px",
                color: "#fca5a5",
                fontSize: "11px",
                fontWeight: 600,
                padding: "4px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s",
              }}
            >
              <span>⏹</span>
              <span>Stop</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
