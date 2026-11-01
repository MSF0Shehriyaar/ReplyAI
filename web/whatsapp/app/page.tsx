'use client';
import WorkspaceGate from './workspace-gate';
import BusinessDashboard from './business-dashboard';
export default function BusinessWorkspace() {
  return <WorkspaceGate renderDashboard={(expire,identity)=><BusinessDashboard onSessionExpired={expire} identity={identity}/>}/>;
}
