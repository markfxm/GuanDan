import { readFileSync } from "node:fs";

it("renders stacked hand cards with rank and suit on the same exposed top line", () => {
  const css = readFileSync("src/styles.css", "utf8");

  expect(css).toContain(".hand-stack .card-face");
  expect(css).toContain("flex-direction: row");
  expect(css).toContain(".hand-stack .card-suit");
  expect(css).toContain("margin-top: 0");
});

it("renders manual grouped cards with rank and suit on the same exposed top line", () => {
  const css = readFileSync("src/styles.css", "utf8");

  expect(css).toContain(".manual-group-card-face .card-face");
  expect(css).toContain(".manual-group-card-face .card-suit");
});
