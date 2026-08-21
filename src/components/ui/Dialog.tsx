import React from "react";

export const Dialog = ({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={() => onOpenChange(false)}
      />
      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 51,
          width: 'calc(100% - 32px)',
          maxWidth: 480,
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          background: 'var(--card-bg)',
          border: '0.5px solid var(--card-border)',
          borderRadius: 12,
          padding: '24px',
          boxShadow: '0 8px 48px rgba(0,0,0,0.3)',
        }}
      >
        {children}
      </div>
    </>
  );
};

export const DialogContent = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-col gap-4 ${className ?? ''}`}>{children}</div>
);

export const DialogHeader = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`flex flex-col space-y-1 ${className ?? ''}`}>{children}</div>
);

export const DialogTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <h2
    className={className}
    style={{ fontSize: 15, fontWeight: 600, color: 'var(--page-title)', margin: 0 }}
  >
    {children}
  </h2>
);
