export function Atmosphere(): React.JSX.Element {
  return (
    <div className="atmosphere" aria-hidden="true">
      <span className="atmosphere__orb atmosphere__orb--a" />
      <span className="atmosphere__orb atmosphere__orb--b" />
      <span className="atmosphere__orb atmosphere__orb--c" />
      <span className="ambient-pointer" />
    </div>
  );
}
