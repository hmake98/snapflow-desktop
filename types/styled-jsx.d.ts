/* eslint-disable no-undef */
import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      style: DetailedHTMLProps<
        StyleHTMLAttributes<HTMLStyleElement>,
        HTMLStyleElement
      > & {
        jsx?: boolean;
        global?: boolean;
        dynamic?: string | string[];
      };
    }
  }
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
