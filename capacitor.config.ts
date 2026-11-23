import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mg.njara.facture',
  appName: 'NJARA FACTURE',
  webDir: 'dist',
  android: {
    allowMixedContent: true
  }
};

export default config;
