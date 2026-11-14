import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DynamicHero from "./DynamicHero";

afterEach(cleanup);

describe("DynamicHero image loading", () => {
  it("shows a shimmer skeleton instead of the default image while content loads", () => {
    render(<DynamicHero content={null} loading onBookService={() => {}} />);

    // The bundled default photo must not render during the first fetch —
    // that is what caused replaced images to flash for ~1s.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector(".landing-media-skeleton")).toBeInTheDocument();
  });

  it("renders the admin-configured image once content is loaded", () => {
    render(
      <DynamicHero
        content={{ image: "https://cdn.example.com/new-hero.jpg", headline: "Welcome" }}
        loading={false}
        onBookService={() => {}}
      />
    );

    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/new-hero.jpg"
    );
    expect(document.querySelector(".landing-media-skeleton")).not.toBeInTheDocument();
  });

  it("keeps the cached image visible during a background revalidation", () => {
    render(
      <DynamicHero
        content={{ image: "https://cdn.example.com/hero.jpg" }}
        loading
        onBookService={() => {}}
      />
    );

    // loading=true with an existing image means a background refresh —
    // the current image stays put, no skeleton flash.
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/hero.jpg"
    );
    expect(document.querySelector(".landing-media-skeleton")).not.toBeInTheDocument();
  });
});
