import React, { createContext, useContext, useState } from "react";
import { cn } from "../../lib/utils";

type TabsContextType = {
  activeTab: string;
  setActiveTab: (value: string) => void;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const Tabs = ({ defaultValue, className, children }: { defaultValue: string; className?: string; children: React.ReactNode }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("flex flex-col", className)}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("inline-flex h-10 items-center justify-center rounded-md p-1", className)}
    style={{ background: 'var(--row-alt)', border: '0.5px solid var(--card-border)' }}>
    {children}
  </div>
);

export const TabsTrigger = ({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) => {
  const ctx = useContext(TabsContext);
  const isActive = ctx?.activeTab === value;
  return (
    <button
      type="button"
      onClick={() => ctx?.setActiveTab(value)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        whiteSpace: 'nowrap', borderRadius: 6, padding: '5px 14px',
        fontSize: 13, fontWeight: isActive ? 500 : 400,
        border: 'none', cursor: 'pointer',
        transition: 'all 0.15s',
        background: isActive ? 'var(--primary)' : 'transparent',
        color: isActive ? 'var(--primary-text)' : 'var(--muted-text)',
      }}
      className={className}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) => {
  const ctx = useContext(TabsContext);
  const isActive = ctx?.activeTab === value;
  // Keep inactive content mounted (hidden) rather than unmounting it. This
  // preserves long-lived resources like camera streams across tab switches,
  // preventing repeated getUserMedia() permission prompts.
  return (
    <div
      className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      style={{ display: isActive ? undefined : 'none' }}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
};
