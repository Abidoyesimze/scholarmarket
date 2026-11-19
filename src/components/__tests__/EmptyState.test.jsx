import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmptyState from "@/components/common/EmptyState";
import { FaBook } from "react-icons/fa";

describe("EmptyState component", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="No items found"
        description="Try adjusting your search criteria."
      />
    );

    expect(screen.getByText("No items found")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your search criteria.")).toBeInTheDocument();
  });

  it("renders correct heading levels for accessibility", () => {
    const { rerender } = render(
      <EmptyState title="Heading 2" headingLevel="h2" />
    );
    expect(screen.getByRole("heading", { level: 2, name: "Heading 2" })).toBeInTheDocument();

    rerender(<EmptyState title="Heading 3" headingLevel="h3" />);
    expect(screen.getByRole("heading", { level: 3, name: "Heading 3" })).toBeInTheDocument();

    rerender(<EmptyState title="Heading 1" headingLevel="h1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Heading 1" })).toBeInTheDocument();
  });

  it("supports primary and secondary CTA buttons with link and click handlers", async () => {
    const user = userEvent.setup();
    const handleSecondary = vi.fn();

    render(
      <EmptyState
        title="No purchases yet"
        primaryAction={{
          label: "Browse Marketplace",
          href: "/marketplace",
        }}
        secondaryAction={{
          label: "Refresh List",
          onClick: handleSecondary,
        }}
      />
    );

    const primaryLink = screen.getByRole("link", { name: "Browse Marketplace" });
    expect(primaryLink).toBeInTheDocument();
    expect(primaryLink).toHaveAttribute("href", "/marketplace");

    const secondaryBtn = screen.getByRole("button", { name: "Refresh List" });
    expect(secondaryBtn).toBeInTheDocument();
    await user.click(secondaryBtn);
    expect(handleSecondary).toHaveBeenCalledTimes(1);
  });

  it("supports 'action' prop as an alias for primaryAction", () => {
    render(
      <EmptyState
        title="No saved materials"
        action={{
          label: "Explore",
          href: "/marketplace",
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Explore" })).toBeInTheDocument();
  });

  it("provides variants for 'no data', 'no results', and 'error'", () => {
    const { container, rerender } = render(
      <EmptyState title="No Data" variant="no-data" />
    );
    expect(container.querySelector(".bg-blue-50")).toBeInTheDocument();

    rerender(<EmptyState title="No Results" variant="no-results" />);
    expect(container.querySelector(".bg-amber-50")).toBeInTheDocument();

    rerender(<EmptyState title="Error Occurred" variant="error" />);
    expect(container.querySelector(".bg-rose-50")).toBeInTheDocument();

    // Also support underscore format
    rerender(<EmptyState title="No Results" variant="no_results" />);
    expect(container.querySelector(".bg-amber-50")).toBeInTheDocument();
  });

  it("renders a custom icon when provided", () => {
    render(
      <EmptyState
        title="Custom Icon State"
        icon={<FaBook data-testid="custom-book-icon" />}
      />
    );

    expect(screen.getByTestId("custom-book-icon")).toBeInTheDocument();
  });
});
