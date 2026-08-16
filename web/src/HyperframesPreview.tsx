import "@hyperframes/player";

interface HyperframesPreviewProps {
  previewUrl?: string | undefined;
  compositionId?: string | undefined;
}

export function HyperframesPreview({ previewUrl, compositionId }: HyperframesPreviewProps) {
  if (!previewUrl) {
    return (
      <div className="composition-empty">
        <span>HF</span>
        <strong>HyperFrames 动效合成</strong>
        <small>设置标题、背景素材和动效后生成可拖动时间轴的预览。</small>
      </div>
    );
  }

  return (
    <hyperframes-player
      key={compositionId}
      className="hyperframes-player"
      src={previewUrl}
      width="1920"
      height="1080"
      controls
      muted
    />
  );
}
