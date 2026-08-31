import { AppearanceSection } from './settings/AppearanceSection.jsx';
import { PagesSection } from './settings/PagesSection.jsx';
import { IntegrationsSection } from './settings/IntegrationsSection.jsx';
import { ComposeScanSection } from './settings/ComposeScanSection.jsx';
import { BackupSection } from './settings/BackupSection.jsx';

export function SettingsView() {
  return (
    <div class="settings-view">
      <AppearanceSection />
      <PagesSection />
      <IntegrationsSection />
      <ComposeScanSection />
      <BackupSection />
    </div>
  );
}
