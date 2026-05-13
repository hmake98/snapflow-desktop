import React from "react";
import Head from "next/head";
import { CenteredLayout } from "../components/layout";
import { Button } from "../components/ui/Button";

export default function ErrorPage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <>
      <Head>
        <title>SnapFlow – Error</title>
      </Head>
      <CenteredLayout maxWidth="md">
        <div className="text-center">
          <div className="text-4xl font-semibold text-gray-700 mb-2">500</div>
          <h1 className="text-h1">Something went wrong</h1>
          <p className="text-muted mt-1.5">
            The app failed to load. This may be a temporary issue.
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={handleRetry}
            className="mt-5"
          >
            Try again
          </Button>
        </div>
      </CenteredLayout>
    </>
  );
}
