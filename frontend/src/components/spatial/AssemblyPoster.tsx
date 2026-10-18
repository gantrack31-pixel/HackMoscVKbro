/** Quiet final composition for reduced motion and unavailable WebGL. */
export function AssemblyPoster() {
  return (
    <div className="assembly-poster" data-testid="assembly-poster">
      <div className="assembly-poster-back back-left">
        <span>DECKLY.AI</span>
      </div>
      <div className="assembly-poster-back back-right">
        <span>ПРОСТРАНСТВО ИДЕЙ</span>
      </div>
      <div className="assembly-poster-slide">
        <div className="assembly-poster-copy">
          <span>DECKLY.AI</span>
          <small>01 / ИСТОРИЯ</small>
          <strong>
            Идеи обретают
            <br />
            свою форму.
          </strong>
          <p>От первого замысла — к целой истории</p>
          <div className="assembly-poster-chart">
            {[30, 48, 40, 65, 79].map((height, i) => (
              <i key={i} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="assembly-poster-landscape">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
