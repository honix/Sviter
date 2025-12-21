import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import type { MarkdownLinkHandler } from "./markdown";

export type MessageProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

const Message = ({ children, className, ...props }: MessageProps) => (
  <div className={cn("flex gap-3", className)} {...props}>
    {children}
  </div>
);

export type MessageAvatarProps = {
  src?: string;
  alt: string;
  fallback?: string;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
};

const MessageAvatar = ({
  src,
  alt,
  fallback,
  delayMs,
  className,
  style,
}: MessageAvatarProps) => {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0", className)} style={style}>
      {src && <AvatarImage src={src} alt={alt} />}
      {fallback && (
        <AvatarFallback delayMs={delayMs} style={style}>
          {fallback}
        </AvatarFallback>
      )}
    </Avatar>
  );
};

export type MessageContentProps = {
  children: React.ReactNode;
  markdown?: boolean;
  className?: string;
  linkHandlers?: MarkdownLinkHandler;
} & Omit<React.ComponentProps<typeof Markdown>, "children"> &
  Omit<React.HTMLProps<HTMLDivElement>, "className">;

const MessageContent = ({
  children,
  markdown = false,
  className,
  linkHandlers,
  ...props
}: MessageContentProps) => {
  const classNames = cn(
    "rounded-lg p-2 text-foreground bg-secondary prose prose-sm break-words",
    "prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1",
    "prose-p:my-1.5",
    "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
    className
  );

  return markdown ? (
    <Markdown className={classNames} linkHandlers={linkHandlers} {...props}>
      {children as string}
    </Markdown>
  ) : (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
};

export type MessageActionsProps = {
  children: React.ReactNode;
  className?: string;
} & React.HTMLProps<HTMLDivElement>;

const MessageActions = ({
  children,
  className,
  ...props
}: MessageActionsProps) => (
  <div
    className={cn("text-muted-foreground flex items-center gap-2", className)}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionProps = {
  className?: string;
  tooltip: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
} & React.ComponentProps<typeof Tooltip>;

const MessageAction = ({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}: MessageActionProps) => {
  return (
    <TooltipProvider>
      <Tooltip {...props}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={className}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageActions,
  MessageAction,
};
