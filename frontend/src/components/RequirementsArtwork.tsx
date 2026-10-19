import { Icon } from "./Icon";

export function RequirementsDeckArtwork() {
  return (
    <div className="req-deck-art" aria-hidden="true">
      <div className="req-deck-back req-deck-back--one" />
      <div className="req-deck-back req-deck-back--two" />
      <div className="req-deck-front">
        <div className="req-deck-top">
          <span>DECKLY</span>
        </div>
        <div className="req-deck-title">
          От идеи
          <br />к истории.
        </div>
        <div className="req-deck-lines">
          <i />
          <i />
        </div>
        <div className="req-deck-chart">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="req-deck-footer">
          <span>01</span>
        </div>
      </div>
      <div className="req-deck-float req-deck-float--spark">
        <Icon name="info-art-design" />
      </div>
      <div className="req-deck-float req-deck-float--check">
        <Icon name="info-art-chart" />
      </div>
    </div>
  );
}

export function RequirementsImageArtwork() {
  return (
    <div className="req-image-art" aria-hidden="true">
      <div className="req-image-frame">
        <div className="req-image-sun" />
        <div className="req-image-hill req-image-hill--back" />
        <div className="req-image-hill req-image-hill--front" />
      </div>
      <div className="req-image-badge">
        <Icon name="info-art-image" />
      </div>
    </div>
  );
}
