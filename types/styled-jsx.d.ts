/* eslint-disable no-undef */
import React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      style: React.StyleHTMLAttributes<HTMLStyleElement> & {
        jsx?: boolean;
        global?: boolean;
        dynamic?: string | string[];
        children?: string;
      };
    }
  }
}
