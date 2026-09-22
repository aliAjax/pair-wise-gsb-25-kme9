import { useStore } from "../../state/store";

export function Notice() {
  const { notice, dismissNotice } = useStore();
  if (!notice) return null;
  return (
    <div className={`notice ${notice.kind}`} role="status">
      <span>{notice.text}</span>
      <button onClick={dismissNotice} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}
