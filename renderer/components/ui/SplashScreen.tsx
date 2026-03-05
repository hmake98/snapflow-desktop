import React from "react";

export function SplashScreen() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center z-50">
      {/* Background blur effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-transparent to-purple-900/10 pointer-events-none" />

      {/* Content container */}
      <div className="relative z-10 text-center max-w-sm px-6">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 flex items-center justify-center">
            <img
              src="/images/logo.png"
              alt="SnapFlow Logo"
              className="w-full h-full object-contain drop-shadow-xl"
            />
          </div>
        </div>

        {/* App name */}
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
          SnapFlow
        </h1>

        {/* Tagline */}
        <p className="text-sm text-slate-400 mb-12 tracking-wide uppercase">
          Screenshot Annotating Tool
        </p>

        {/* Loading indicator */}
        <div className="flex justify-center gap-2 mb-8">
          <div
            className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: "0s" }}
          />
          <div
            className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: "0.2s" }}
          />
          <div
            className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
            style={{ animationDelay: "0.4s" }}
          />
        </div>

        {/* Status text */}
        <p className="text-xs text-slate-500 tracking-wide">
          Initializing application...
        </p>
      </div>
    </div>
  );
}
