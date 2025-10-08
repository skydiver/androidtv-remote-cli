# Android TV Remote CLI

Android TV Remote CLI is a Node.js terminal application that lets you drive any Android TV / Google TV device from your keyboard. It bundles encrypted pairing, an interactive menu, and a D-pad mode so you can mute, power toggle, and navigate the operating system without picking up the hardware remote.

---

## Features

- Interactive terminal UI with menu shortcuts for power, mute, home, debug, and exit.
- Full keyboard-driven D-pad mode with on-screen guidance and number key support.
- Secure certificate-based pairing; credentials persist between sessions.
- One-time host discovery that stores the Android TV IP address for reuse.
- Optional debug mode to trace every command sent to the TV.
- Build pipeline that produces a single bundled executable (`build/tvrc`).

---

## Requirements

- Node.js ≥ 22 (Volta pin: 22.13.1).
- pnpm ≥ 10 (the repo is configured with pnpm).
- Android TV or Google TV device on the same local network with pairing enabled.
- Access to TCP ports 6466 (remote) and 6467 (pairing) between your machine and the TV.
- A TTY-capable terminal for the interactive menu and D-pad mode.

---

## Installation

```bash
git clone https://github.com/<your-user>/androidtv-remote-cli.git
cd androidtv-remote-cli
pnpm install
```

If you rely on Volta, the pinned versions in `package.json` will be picked up automatically. Otherwise ensure your global Node and pnpm versions satisfy the requirements above.

---

## Building

Bundle the CLI into `build/tvrc`:

```bash
pnpm build
```

The build step runs esbuild, injects a shebang with the current `node` path, and marks the output executable. Run the bundled binary directly:

```bash
./build/tvrc
```

---

## Running from Source

For a one-off session without bundling:

```bash
pnpm start
```

During development you can keep a live TypeScript session with:

```bash
pnpm dev
```

---

## First-Time Setup & Pairing

1. Make sure your TV is powered on and reachable on the network (ping it if unsure).
2. Run `pnpm start` (or `./build/tvrc` after a build).
3. When prompted, enter the TV’s IP address. The address is saved via [`conf`](https://github.com/sindresorhus/conf) so you only do this once.
4. The TV will display a pairing code on screen. Enter the code in the terminal prompt.
5. Pairing certificates are stored in your OS-specific config directory (e.g. `~/Library/Preferences/androidtv/settings.json` on macOS, `%APPDATA%/androidtv/settings.json` on Windows, `~/.config/androidtv/settings.json` on Linux).

Subsequent launches reuse the stored host and certificate, skipping the prompts unless the TV invalidates them.

---

## CLI Usage

You can launch straight into different modes:

```bash
./build/tvrc         # Start with the interactive menu
./build/tvrc dpad    # Jump directly to D-pad mode
./build/tvrc help    # Show the help screen first
```

### Main Menu Controls

- `↑` / `↓` arrows: Move through menu items.
- `Enter`: Run the selected command.
- `Esc`, `Ctrl+C`, or `q`: Exit the application.

Menu options include:
- 🎮 D-pad Controls — switch to keyboard-driven remote mode.
- 🏠 Home — send the HOME command.
- 🔇 Mute — toggle mute.
- 🔌 Power — toggle device power.
- 🐞 Debug — enable/disable verbose console logging.
- ℹ️ Help — display in-terminal usage instructions.
- 🚪 Exit — close the app.

### D-pad Mode

Once activated, the terminal renders a virtual remote. Controls:

- Arrow keys: D-pad navigation.
- `Enter` / `Space`: Select / OK.
- `Backspace`: Back.
- `h`: Home.
- `m`: Mute.
- `+` / `-`: Volume up / down.
- `0`–`9`: Number pad.
- `Esc`: Return to menu.
- `Ctrl+C`: Exit the application.

D-pad and help modes both require a TTY; if one isn’t available the app falls back to the menu and shows a status warning.

---

## Stored Configuration

Settings persist across runs:

- `host`: Android TV IP address.
- `cert`: Pairing certificate and key.

To reset pairing, remove the `androidtv/settings.json` file in your platform’s config directory and rerun the CLI.

---

## Development Scripts

| Command             | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `pnpm start`        | Run the CLI via TSX (ideal for manual testing).    |
| `pnpm dev`          | Watch-mode TypeScript execution with hot reload.   |
| `pnpm build`        | Produce the bundled executable in `build/tvrc`.    |
| `pnpm clean`        | Remove the `build` directory.                      |
| `pnpm test`         | Execute Vitest suites (none included yet).         |
| `pnpm lint:check`   | Biome static analysis.                             |
| `pnpm lint:fix`     | Apply Biome autofixes.                             |
| `pnpm lint:format`  | Format source files with Biome.                    |

Vitest is configured but no tests ship with the repo; add your own under `src/` as needed.

---

## Troubleshooting

- **Pairing fails immediately**: Confirm the TV displays a pairing code and that ports 6466/6467 are open.
- **TTY errors**: Ensure you’re running in an interactive terminal (no piping or background execution).
- **Device disconnected mid-session**: The remote manager auto-reconnects, but you may need to rerun the CLI if the TV power cycles.
- **Need to re-pair**: Delete the stored config file (`androidtv/settings.json`) and start over.
- **Debugging**: Toggle the debug option in the menu to see raw event logs in the terminal.

---

## Credits

This project builds on [`androidtvremote2`](https://github.com/tronikos/androidtvremote2/) by TroniKOS. The upstream library is Apache-2.0 licensed; we vendor a modified copy of that package under `src/lib/androidtv-remote` so we can ship our CLI-specific fixes while we work to upstream them.

If you rely on the vendored code, please review the [`LICENSE-APACHE`](https://www.apache.org/licenses/LICENSE-2.0) terms from the original project.


## License

[MIT](./LICENSE) © Martín M.
