import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightedSchemaPath } from "./schema-path";

describe("HighlightedSchemaPath", () => {
  it("highlights path parameters while rendering untrusted path text safely", () => {
    const path =
      '/projects/{projectId}/files/<img src="missing" onerror="alert(1)">';

    render(
      <span data-testid="schema-path">
        <HighlightedSchemaPath path={path} />
      </span>,
    );

    const renderedPath = screen.getByTestId("schema-path");
    expect(renderedPath.textContent).toBe(path);
    expect(renderedPath.querySelector("img")).toBeNull();
    expect(
      renderedPath.querySelector(
        ".text-info-foreground.dark\\:text-info-foreground",
      ),
    ).toHaveTextContent("{projectId}");
  });
});
