interface DashboardLayoutProps {
  readonly children: React.ReactNode;
}

// Passthrough — per-section layouts (login, (protected)) provide their own wrappers.
export default function DashboardLayout({ children }: DashboardLayoutProps): React.JSX.Element {
  return <>{children}</>;
}
