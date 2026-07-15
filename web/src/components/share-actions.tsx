import { Download, LoaderCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export type CardAction = "share" | "download" | null;

type ShareActionsProps = {
  action: CardAction;
  onDownload: () => void;
  onShare: () => void;
};

/** Separate controls preserve the participant's choice between sharing and saving. */
export function ShareActions({
  action,
  onDownload,
  onShare,
}: ShareActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Button
        className="h-14 rounded-2xl text-[15px] font-bold"
        disabled={action !== null}
        onClick={onShare}
      >
        {action === "share" ? (
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        ) : (
          <Share2 aria-hidden="true" className="size-5" />
        )}
        {action === "share" ? "공유 준비 중" : "공유하기"}
      </Button>
      <Button
        className="h-14 rounded-2xl text-[15px] font-bold"
        disabled={action !== null}
        onClick={onDownload}
        variant="outline"
      >
        {action === "download" ? (
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
        ) : (
          <Download aria-hidden="true" className="size-5" />
        )}
        {action === "download" ? "이미지 준비 중" : "이미지로 저장하기"}
      </Button>
    </div>
  );
}
