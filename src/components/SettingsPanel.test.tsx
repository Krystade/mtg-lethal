import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";
import { useStore } from "../state/store";
import { BUILTIN_TEMPLATES, buildFreeLayout, templateSeats } from "../layout/freeform";
import { defaultLayoutFor } from "../layout/presets";

const s = () => useStore.getState();
const X = BUILTIN_TEMPLATES.find((t) => t.id === "x")!;
const btn = () => screen.getByRole("button", { name: "Basic grid" }) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  s().newGame({ playerCount: 4, startingLife: 40, layout: defaultLayoutFor(4) });
});
afterEach(cleanup);

describe("Settings: Basic grid", () => {
  it("is disabled, and says why, when the board is already the standard grid", () => {
    render(<SettingsPanel onClose={() => {}} />);
    expect(btn().disabled).toBe(true);
    expect(screen.getByText("Already on the standard grid.")).toBeInTheDocument();
  });

  it("on a freeform board, resets to the standard grid, keeps the players and stays open", () => {
    s().applyLayout(buildFreeLayout(templateSeats(X), X.name));
    s().adjustLife("p1", -9);
    s().setPlayerName("p3", "Dana");
    const people = () => s().game.players.map((p) => [p.id, p.name, p.life, p.color]);
    const before = people();
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);
    expect(btn().disabled).toBe(false);
    expect(screen.getByText("Reset the layout to the standard grid for 4 players.")).toBeInTheDocument();

    fireEvent.click(btn());

    expect(s().game.layout).toEqual(defaultLayoutFor(4));
    expect(people()).toEqual(before);
    expect(onClose).not.toHaveBeenCalled();
    expect(btn().disabled).toBe(true);
    expect(screen.getByText("Already on the standard grid.")).toBeInTheDocument();
  });

  it("is enabled on a grid whose seats were turned", () => {
    s().setSeatRotation("p0", 180);
    render(<SettingsPanel onClose={() => {}} />);
    expect(btn().disabled).toBe(false);
    fireEvent.click(btn());
    expect(s().game.layout).toEqual(defaultLayoutFor(4));
  });
});
