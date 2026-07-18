import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudioShell from "@/components/StudioShell";
import { resetStore } from "./helpers";

beforeEach(resetStore);

describe("panel data states", () => {
  it("shows loading, error, and empty states for the project panel", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    const nav = () => screen.getByRole("complementary", { name: "Project navigation" });
    const switcher = () => within(nav()).getByRole("combobox", { name: "Projects demo state" });

    await user.selectOptions(switcher(), "loading");
    expect(within(nav()).getByRole("status", { name: "Loading" })).toBeInTheDocument();

    await user.selectOptions(switcher(), "error");
    expect(within(nav()).getByRole("alert")).toHaveTextContent("Something went wrong");

    await user.selectOptions(switcher(), "empty");
    expect(within(nav()).getByText(/No projects yet/)).toBeInTheDocument();

    await user.selectOptions(switcher(), "normal");
    expect(
      within(nav()).getByRole("button", { name: /Airbnb Cinematic Edit/ }),
    ).toBeInTheDocument();
  });

  it("shows loading, error, and empty states for the media browser", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    const media = () => screen.getByRole("region", { name: "Media browser" });
    const switcher = () => within(media()).getByRole("combobox", { name: "Media demo state" });

    await user.selectOptions(switcher(), "loading");
    expect(within(media()).getByRole("status", { name: "Loading" })).toBeInTheDocument();

    await user.selectOptions(switcher(), "error");
    expect(within(media()).getByRole("alert")).toHaveTextContent("Something went wrong");

    await user.selectOptions(switcher(), "empty");
    expect(within(media()).getByText(/No media in this project/)).toBeInTheDocument();
  });

  it("shows a natural empty state when search matches nothing", async () => {
    const user = userEvent.setup();
    render(<StudioShell />);
    const media = screen.getByRole("region", { name: "Media browser" });
    await user.type(within(media).getByRole("searchbox", { name: "Search media" }), "zzzzz");
    expect(within(media).getByText(/No media matches/)).toBeInTheDocument();
  });
});
