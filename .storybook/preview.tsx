import type { Preview } from "@storybook/react-vite";
import "../src/app/globals.css";
import "../src/features/cly/cly.css";

const preview: Preview = {
  parameters: {
    a11y: { test: "error" },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#111210" },
        { name: "light", value: "#f5f5f3" },
      ],
    },
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="dark cly-app" style={{ minHeight: "100vh", padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
