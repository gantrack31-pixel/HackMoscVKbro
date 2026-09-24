/** Ненавязчивые геометрические формы; не индикатор выполнения запроса. */
export function SystemActivity({ placement = "workspace" }: { placement?: "left" | "right" | "workspace" }) {
  return <div className={`system-activity geometry-field geometry-${placement}`} aria-hidden="true">
    <i className="geometry-disc" /><i className="geometry-frame" /><i className="geometry-pill" />
  </div>;
}
