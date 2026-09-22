import type { Direction, Phoria } from "../../data/types";

export function PhoriaInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Phoria;
  onChange: (value: Phoria) => void;
}) {
  const isOrtho = value.direction === "ortho";
  return (
    <label className="field">
      <span>{label}</span>
      <div className="phoria-input">
        <select
          value={value.direction}
          onChange={(e) =>
            onChange({
              direction: e.target.value as Direction,
              magnitude: isOrtho && e.target.value !== "ortho" ? 6 : value.magnitude,
            })
          }
        >
          <option value="ortho">正位</option>
          <option value="exo">外隐斜</option>
          <option value="eso">内隐斜</option>
        </select>
        <input
          type="number"
          min={0}
          step={0.5}
          value={isOrtho ? 0 : value.magnitude}
          disabled={isOrtho}
          onChange={(e) => onChange({ ...value, magnitude: Number(e.target.value) })}
        />
        <em>△</em>
      </div>
    </label>
  );
}
