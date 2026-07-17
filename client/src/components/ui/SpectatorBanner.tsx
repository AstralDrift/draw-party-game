export function SpectatorBanner(): React.JSX.Element {
  return (
    <div className="spectator-banner">
      <span className="pill spectator-pill">Spectating</span>
      <p className="muted">Watch-only for now. You join as a player on the next drawing round.</p>
    </div>
  );
}
