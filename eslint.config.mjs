import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "app/**",
      "out/**",
      ".next/**",
      "**/*.config.js",
      "**/*.config.mjs",
      "renderer/.next/**",
      "renderer/next-env.d.ts",
    ],
  },
  // Base configuration for all files
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        alert: "readonly",
        confirm: "readonly",
        fetch: "readonly",
        atob: "readonly",
        btoa: "readonly",
        Image: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        RequestInfo: "readonly",
        RequestInit: "readonly",
        AbortController: "readonly",
        Headers: "readonly",
        Response: "readonly",
        // DOM Types
        HTMLElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLParagraphElement: "readonly",
        HTMLHeadingElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLVideoElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLFormElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLTextAreaElement: "readonly",
        // DOM Events
        Event: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        FocusEvent: "readonly",
        TouchEvent: "readonly",
        // DOM Nodes
        Node: "readonly",
        NodeList: "readonly",
        Element: "readonly",
        // Node globals
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        Buffer: "readonly",
        global: "readonly",
        // TypeScript globals
        NodeJS: "readonly",
        // Timers
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        // ES2021 globals
        Promise: "readonly",
        Symbol: "readonly",
        WeakMap: "readonly",
        WeakSet: "readonly",
        Map: "readonly",
        Set: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...typescript.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/use-unknown-in-catch-callback": "off",
      "no-console": "off",
      "no-throw-literal": "off",
    },
  },
  // Prettier config (must be last to override other configs)
  prettier,
];
