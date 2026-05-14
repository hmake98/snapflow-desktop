import "react";

declare module "react" {
  // Extend StyleHTMLAttributes so <style jsx global> is accepted everywhere.
  // Mirrors what styled-jsx/global.d.ts does; loaded via typeRoots auto-inclusion.
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
    dynamic?: string | string[];
  }
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
