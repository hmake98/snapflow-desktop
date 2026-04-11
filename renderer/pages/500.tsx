import React from "react";
import Head from "next/head";
import { WindowControls } from "../components/ui/WindowControls";

export default function ErrorPage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <>
      <Head>
        <title>SnapFlow - Error</title>
      </Head>
      <div className="flex flex-col bg-gray-950 text-gray-100 select-none pt-8" style={{ height: "100vh" }}>
        <div className="flex items-center justify-between px-4 h-11 border-b border-gray-800/50 flex-shrink-0">
          <span className="text-sm font-medium text-gray-400">SnapFlow</span>
          <WindowControls />
        </div>

        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8">
          <div className="text-5xl font-bold text-gray-700">500</div>
          <h1 className="text-xl font-semibold text-gray-200">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            The app failed to load. This may be a temporary issue.
          </p>
          <button
            onClick={handleRetry}
            className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    </>
  );
}
